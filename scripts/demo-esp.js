import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createApplication } from '../src/app.js';

// Isolated server: demo commands never reach a real ESP32 or production history.
const directory = await mkdtemp(join(tmpdir(), 'esp32-api-demo-'));
let application, socket;
const events = [];
async function next(name) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const index = events.findIndex(([event]) => event === name);
    if (index >= 0) return events.splice(index, 1)[0][1];
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error('Missing dashboard event: ' + name);
}
try {
  application = await createApplication({
    configFile: join(directory, 'config.json'),
    historyFile: join(directory, 'history.sqlite'),
    httpGet: async (url) => ({
      data: url.includes('flood-api')
        ? { daily: { river_discharge: [12] } }
        : { current: { temperature_2m: 26, precipitation: 2 } },
    }),
  });
  await new Promise((resolve) => application.server.listen(0, '127.0.0.1', resolve));
  const port = application.server.address().port;
  const base = `http://127.0.0.1:${port}`;
  console.log(`Demo server: ${base} (temporary data; simulated ESP32 and weather)`);
  assert.equal((await fetch(base)).status, 200);
  socket = new WebSocket(`ws://127.0.0.1:${port}/socket.io/?EIO=4&transport=websocket`);
  socket.onmessage = ({ data }) => {
    const message = String(data);
    if (message.startsWith('0')) socket.send('40');
    if (message === '2') socket.send('3');
    if (message.startsWith('42')) events.push(JSON.parse(message.slice(2)));
    if (message.startsWith('43'))
      events.push(['ack', JSON.parse(message.slice(message.indexOf('[')))[0]]);
  };
  await next('configUpdate');
  assert.equal((await next('dashboardUpdate')).sensorLevel, null);
  socket.send('421' + JSON.stringify(['liftCommand', { action: 'up' }]));
  assert.match((await next('ack')).error, /fresh/);
  const post = (body) =>
    fetch(base + '/api/esp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  const samples = [
    { level: 0, waterRaw: 0, distanceCm: 20, motorActive: true, motorDirection: 'down' },
    { level: 0, waterRaw: 1, distanceCm: 25, motorActive: true, motorDirection: 'down' },
    { level: 42, waterRaw: 520, distanceCm: 95.5, motorActive: true, motorDirection: 'up' },
    {
      level: 42,
      waterRaw: 520,
      distanceCm: 95.5,
      motorActive: false,
      motorDirection: 'stopped',
      upperLimit: true,
    },
    {
      level: 0,
      waterRaw: 0,
      distanceCm: 20,
      motorActive: false,
      motorDirection: 'stopped',
      lowerLimit: true,
    },
  ];
  for (const sample of samples) {
    const response = await post(sample);
    assert.equal(response.status, 200);
    const reply = await response.json();
    assert.equal(reply.ok, true);
    assert.equal(reply.controlMode, 'local');
    assert.equal(reply.liftCommand, null);
    const update = await next('dashboardUpdate');
    assert.equal(update.waterRaw, sample.waterRaw);
    assert.equal(update.motorDirection, sample.motorDirection);
    console.log(
      'ESP telemetry -> HTTP 200, raw=' +
        update.waterRaw +
        ', actual motor=' +
        update.motorDirection,
    );
  }
  for (const action of ['up', 'down', 'stop']) {
    socket.send('421' + JSON.stringify(['liftCommand', { action }]));
    const accepted = await next('ack');
    assert.equal(accepted.ok, true);
    const response = await post(samples[0]);
    const delivered = await response.json();
    assert.equal(delivered.liftCommand, action);
    assert.equal(delivered.commandId, accepted.command.id);
    await next('dashboardUpdate');
  }
  console.log('PASS: optional dashboard Up/Down/Stop is delivered through polling');
  assert.equal((await post({ level: 0, waterRaw: -1, motorActive: false })).status, 400);
  assert.equal((await post({ level: 0, waterRaw: 4096, motorActive: false })).status, 400);
  const record = application.history.record;
  application.history.record = () => {
    throw new Error('Simulated storage failure');
  };
  assert.equal((await post(samples[0])).status, 503);
  application.history.record = record;
  assert.equal(
    (await (await fetch(base + '/api/history')).json()).items.length,
    samples.length + 3,
  );
  socket.close();
  socket = null;
  await application.close();
  application = null;
  application = await createApplication({
    configFile: join(directory, 'config.json'),
    historyFile: join(directory, 'history.sqlite'),
    httpGet: async () => {
      throw new Error('Simulated weather outage');
    },
  });
  assert.equal(application.history.list().items.length, samples.length + 3);
  assert.equal(application.history.list().items[0].sensors.waterRaw, 0);
  console.log(
    'PASS: raw telemetry, dashboard broadcasts, validation, storage errors, and restart persistence',
  );
  console.log('DEMO PASSED. ESP32 firmware and physical offline motion still need a board test.');
} finally {
  socket?.close();
  await application?.close();
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  await rm(directory, { recursive: true, force: true });
}
