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
  await next('liftCommandUpdate');
  async function request(action) {
    socket.send('421' + JSON.stringify(['liftCommand', { action }]));
    return next('ack');
  }
  async function post(body) {
    return fetch(base + '/api/esp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  async function reading(level, distanceCm, motorDirection) {
    const payload = {
      level,
      distanceCm,
      motorActive: motorDirection !== 'stopped',
      motorDirection,
    };
    const response = await post(payload);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const command = await response.json();
    const update = await next('dashboardUpdate');
    assert.equal(update.sensorLevel, level);
    assert.equal(update.distanceCm, distanceCm);
    assert.equal(update.motorDirection, motorDirection);
    assert.equal(update.motorActive, payload.motorActive);
    assert.equal(
      update.houseHeightCm,
      distanceCm === null ? null : Math.max(0, distanceCm - command.baselineCm),
    );
    console.log(
      `ESP -> POST ${JSON.stringify(payload)} -> HTTP 200; server command=${command.liftCommand}; dashboard updated`,
    );
    return command;
  }
  assert.match((await request('up')).error, /fresh/);
  console.log('PASS: movement rejected before first ESP reading');
  assert.equal((await reading(10, 20, 'stopped')).liftCommand, 'auto');
  const accepted = await request('up');
  assert.equal(accepted.ok, true);
  const up = await reading(85, 35, 'up');
  assert.equal(up.liftCommand, 'up');
  assert.equal(up.commandId, accepted.command.requestedAt);
  assert.ok(up.commandRemainingMs > 0 && up.commandRemainingMs <= 15000);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const repeated = await reading(90, 45, 'up');
  assert.equal(repeated.commandId, up.commandId);
  assert.ok(repeated.commandRemainingMs < up.commandRemainingMs);
  assert.match((await request('down')).error, /Stop/);
  assert.equal((await request('stop')).ok, true);
  assert.equal((await reading(90, 45, 'stopped')).liftCommand, 'stop');
  assert.equal((await request('down')).ok, true);
  assert.equal((await reading(15, 30, 'down')).liftCommand, 'down');
  assert.equal((await request('stop')).ok, true);
  assert.equal((await reading(10, null, 'stopped')).liftCommand, 'stop');
  console.log(
    'PASS: Up/Stop/Down/Stop, reversal interlock, decreasing expiry, and missing ultrasonic echo',
  );
  for (const bad of [
    { level: 101, motorActive: false },
    { level: 30, distanceCm: -1, motorActive: false },
    { level: 30, motorActive: false, motorDirection: 'up' },
  ])
    assert.equal((await post(bad)).status, 400);
  let history = await (await fetch(base + '/api/history')).json();
  assert.equal(history.items.length, 6);
  assert.ok(history.items.some(({ sensors }) => sensors.motorDirection === 'down'));
  console.log('PASS: invalid payloads rejected; all 6 accepted readings saved in SQLite');
  const record = application.history.record;
  application.history.record = () => {
    throw new Error('Simulated disk failure');
  };
  assert.equal((await post({ level: 50, motorActive: false })).status, 503);
  application.history.record = record;
  assert.equal(application.telemetry.snapshot().sensorLevel, 10);
  console.log('PASS: storage failure returns 503 without accepting or broadcasting telemetry');
  console.log('Checking real 15-second command expiration...');
  assert.equal((await request('up')).ok, true);
  await new Promise((resolve) => setTimeout(resolve, 15100));
  assert.equal((await reading(10, 20, 'stopped')).liftCommand, 'stop');
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
  assert.equal(application.history.list().items.length, 7);
  assert.equal(application.lift.current().action, null);
  console.log(
    'PASS: expiration returns Stop; history survives server restart; transient commands clear',
  );
  console.log(
    'DEMO PASSED. This verifies the server protocol, not physical ESP32 Wi-Fi, firmware execution, or motor wiring.',
  );
} finally {
  socket?.close();
  await application?.close();
  assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
  await rm(directory, { recursive: true, force: true });
}
