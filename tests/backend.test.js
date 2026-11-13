import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';
import { validateConfig, validateTelemetry } from '../src/domain/validation.js';
import { createConfigStore } from '../src/services/config-store.js';
import { createTelemetryStore } from '../src/services/telemetry-store.js';
import { createWeatherService } from '../src/services/weather-service.js';
import { createApplication } from '../src/app.js';

async function temporaryConfig(t, beforeCleanup = async () => {}) {
  const directory = await mkdtemp(join(tmpdir(), 'houselift-test-'));
  t.after(async () => {
    await beforeCleanup();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  });
  return join(directory, 'config.json');
}
const fakeWeather = async (url) =>
  url.includes('flood-api')
    ? { data: { daily: { river_discharge: [12] } } }
    : { data: { current: { temperature_2m: 26, precipitation: 2 } } };

test('configuration rejects invalid thresholds and strips unknown fields', () => {
  for (const input of [
    null,
    { ...DEFAULT_CONFIG, startLevel: 10, stopLevel: 20 },
    { ...DEFAULT_CONFIG, lat: 91 },
    { ...DEFAULT_CONFIG, maxHeightCm: 0 },
  ]) {
    assert.throws(() => validateConfig(input));
  }
  assert.deepEqual(
    validateConfig({ ...DEFAULT_CONFIG, apiKey: 'private', unknown: true }),
    DEFAULT_CONFIG,
  );
});
test('telemetry validates ranges, booleans and optional ultrasonic readings', () => {
  for (const input of [
    null,
    { level: 101, motorActive: true },
    { level: 50, motorActive: 'true' },
    { level: 50, motorActive: false, distanceCm: -1 },
  ])
    assert.throws(() => validateTelemetry(input));
  assert.equal(validateTelemetry({ level: 40, motorActive: true }).distanceCm, null);
});
test('elevation uses calibration, clamps at ground, and does not fabricate initial readings', () => {
  let config = { ...DEFAULT_CONFIG };
  const store = createTelemetryStore(() => config);
  assert.equal(store.snapshot().houseHeightCm, null);
  assert.equal(store.isFresh(), false);
  assert.equal(
    store.update({ level: 30, motorActive: true, distanceCm: 95.5 }).houseHeightCm,
    75.5,
  );
  config.baselineCm = 50;
  assert.equal(store.snapshot().houseHeightCm, 45.5);
  assert.equal(store.update({ level: 30, motorActive: false, distanceCm: 10 }).houseHeightCm, 0);
  assert.equal(store.update({ level: 30, motorActive: false }).houseHeightCm, null);
});
test('settings persist without API keys and reject invalid changes without changing active settings', async (t) => {
  const file = await temporaryConfig(t);
  const store = await createConfigStore({ file });
  await store.save({ ...DEFAULT_CONFIG, baselineCm: 25, apiKey: 'test-key' });
  assert.equal(store.publicConfig().apiKeyConfigured, true);
  assert.equal('apiKey' in store.publicConfig(), false);
  assert.equal((await readFile(file, 'utf8')).includes('test-key'), false);
  await assert.rejects(store.save({ ...DEFAULT_CONFIG, startLevel: 0 }));
  assert.equal(store.get().baselineCm, 25);
  const reloaded = await createConfigStore({ file });
  assert.equal(reloaded.get().baselineCm, 25);
  assert.equal(reloaded.publicConfig().apiKeyConfigured, false);
});
test('invalid persisted settings fall back to defaults', async (t) => {
  const file = await temporaryConfig(t);
  await writeFile(file, JSON.stringify({ ...DEFAULT_CONFIG, baselineCm: -50 }));
  const store = await createConfigStore({ file });
  assert.deepEqual(store.get(), DEFAULT_CONFIG);
});
test('weather still works when river discharge fails', async () => {
  const service = createWeatherService({
    getConfig: () => DEFAULT_CONFIG,
    onUpdate: () => {},
    get: async (url) => {
      if (url.includes('flood-api')) throw new Error('offline');
      return fakeWeather(url);
    },
  });
  const result = await service.refresh();
  assert.equal(result.current.temperature_2m, 26);
  assert.equal(result.riverDischarge, null);
});
test('changing location discards in-flight weather from the previous city', async () => {
  let config = { ...DEFAULT_CONFIG },
    release;
  const updates = [];
  const barrier = new Promise((resolve) => {
    release = resolve;
  });
  let requests = 0;
  const service = createWeatherService({
    getConfig: () => config,
    onUpdate: (data) => updates.push(data),
    get: async (url) => {
      requests++;
      if (requests <= 2) await barrier;
      return fakeWeather(url);
    },
  });
  const pending = service.refresh();
  config = { ...config, city: 'London', country: 'United Kingdom', lat: 51.5, lon: -0.1 };
  const changed = service.invalidate();
  release();
  assert.equal(await pending, null);
  assert.equal((await changed).location, 'London, United Kingdom');
  assert.equal(updates.filter(Boolean).length, 1);
});

function connectSocket(port) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  const queue = [];
  ws.onmessage = ({ data }) => {
    const message = String(data);
    if (message.startsWith('0')) ws.send('40');
    if (message === '2') ws.send('3');
    if (message.startsWith('42')) queue.push(JSON.parse(message.slice(2)));
    if (message.startsWith('43'))
      queue.push(['ack', JSON.parse(message.slice(message.indexOf('[')))[0]]);
  };
  return {
    ws,
    async next(name) {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const index = queue.findIndex((event) => event[0] === name);
        if (index !== -1) return queue.splice(index, 1)[0][1];
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      throw new Error('Missing socket event: ' + name);
    },
  };
}
test(
  'HTTP and socket contracts survive the refactor, including feedback and secret handling',
  { timeout: 15000 },
  async (t) => {
    let application;
    const configFile = await temporaryConfig(t, async () => application?.close());
    let analysisInput;
    application = await createApplication({
      configFile,
      apiKey: 'private-test-key',
      httpGet: fakeWeather,
      generateFeedback: async (input) => {
        analysisInput = input;
        return { text: 'Test assessment' };
      },
    });
    await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
    const port = application.server.address().port,
      base = `http://127.0.0.1:${port}`;
    for (const path of ['/', '/css/style.css', '/js/app.js', '/js/features/location-picker.js'])
      assert.equal((await fetch(base + path)).status, 200);
    const cities = await (await fetch(base + '/api/cities?country=BD')).json();
    assert.ok(cities.some((city) => city.city === 'Dhaka'));
    assert.ok(cities.every((city) => city.countryCode === 'BD'));
    assert.equal((await fetch(base + '/api/cities?country=invalid')).status, 400);
    assert.equal((await fetch(base + '/api/locations?q=a&country=BD')).status, 400);
    const socket = connectSocket(port);
    t.after(() => socket.ws.close());
    const config = await socket.next('configUpdate');
    assert.equal('apiKey' in config, false);
    assert.equal((await socket.next('dashboardUpdate')).sensorLevel, null);
    assert.equal((await socket.next('liftCommandUpdate')).action, null);
    socket.ws.send('421' + JSON.stringify(['liftCommand', { action: 'up' }]));
    assert.match((await socket.next('ack')).error, /fresh/);
    socket.ws.send('42["requestAnalysis"]');
    assert.match((await socket.next('analysisResult')).error, /fresh sensor/);
    const post = (body) =>
      fetch(base + '/api/esp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    assert.equal((await post(null)).status, 400);
    assert.equal((await post({ level: 150, motorActive: true })).status, 400);
    assert.equal(
      (
        await fetch(base + '/api/esp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: '{',
        })
      ).status,
      400,
    );
    assert.equal((await post({ level: 42, distanceCm: 95.5, motorActive: true })).status, 200);
    assert.equal((await socket.next('dashboardUpdate')).houseHeightCm, 75.5);
    const historyResponse = await fetch(base + '/api/history');
    assert.equal(historyResponse.status, 200);
    const logged = await historyResponse.json();
    assert.equal(logged.items.length, 1);
    assert.equal(logged.items[0].sensors.houseHeightCm, 75.5);
    assert.equal(logged.items[0].weather.current.temperature_2m, 26);
    assert.equal(JSON.stringify(logged).includes('private-test-key'), false);
    assert.equal((await fetch(base + '/api/history?from=invalid')).status, 400);
    const record = application.history.record;
    application.history.record = () => {
      throw new Error('Storage unavailable');
    };
    assert.equal((await post({ level: 40, motorActive: false })).status, 503);
    application.history.record = record;
    assert.equal((await (await fetch(base + '/api/history')).json()).items.length, 1);
    socket.ws.send('420' + JSON.stringify(['updateConfig', { ...config, baselineCm: 30 }]));
    assert.equal((await socket.next('ack')).ok, true);
    assert.equal((await socket.next('dashboardUpdate')).houseHeightCm, 65.5);
    socket.ws.send('42["requestAnalysis"]');
    assert.equal((await socket.next('analysisResult')).text, 'Test assessment');
    assert.equal(analysisInput.sensors.houseHeightCm, 65.5);
    assert.equal(analysisInput.weather.current.temperature_2m, 26);
    assert.equal(JSON.stringify(analysisInput.config).includes('private-test-key'), false);
    for (const action of ['up', 'stop', 'down', 'stop']) {
      socket.ws.send('422' + JSON.stringify(['liftCommand', { action }]));
      assert.equal((await socket.next('ack')).command.action, action);
      assert.equal((await socket.next('liftCommandUpdate')).action, action);
      const response = await post({ level: 42, distanceCm: 95.5, motorActive: false });
      const command = await response.json();
      assert.equal(command.liftCommand, action);
      assert.equal(command.mode, 'manual');
      assert.equal(command.manualState, action === 'up');
      assert.equal((await socket.next('dashboardUpdate')).motorActive, false);
    }
  },
);
