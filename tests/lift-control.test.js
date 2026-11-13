import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiftControl, MOVE_DURATION_MS } from '../src/services/lift-control.js';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';
import { validateTelemetry } from '../src/domain/validation.js';

test('manual Up/Down/Stop override polling without making legacy controllers raise on Down', () => {
  let fresh = true,
    clock = Date.parse('2026-11-14T12:00:00Z');
  const updates = [];
  const lift = createLiftControl({
    isFresh: () => fresh,
    now: () => clock,
    onChange: (command) => updates.push(command),
  });
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'auto');
  const up = lift.request('up');
  assert.equal(Date.parse(up.expiresAt) - clock, MOVE_DURATION_MS);
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).manualState, true);
  assert.throws(() => lift.request('down'), /Stop/);
  lift.request('stop');
  const down = lift.request('down');
  assert.equal(down.action, 'down');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'down');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).manualState, false);
  fresh = false;
  assert.throws(() => lift.request('up'), /fresh/);
  assert.equal(lift.request('stop').action, 'stop');
  assert.throws(() => lift.request('sideways'), /Choose/);
  assert.equal(lift.current().action, 'stop');
});
test('movement expires to a latched Stop and a fresh server does not replay browser commands', () => {
  let clock = Date.now();
  const lift = createLiftControl({ isFresh: () => true, onChange: () => {}, now: () => clock });
  lift.request('up');
  clock += MOVE_DURATION_MS;
  assert.equal(lift.current().action, 'stop');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).mode, 'manual');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).manualState, false);
  const restarted = createLiftControl({ isFresh: () => true, onChange: () => {} });
  assert.equal(restarted.current().action, null);
});
test('actual motor direction is validated independently of the requested command', () => {
  assert.equal(
    validateTelemetry({ level: 40, motorActive: true, motorDirection: 'down' }).motorDirection,
    'down',
  );
  assert.equal(validateTelemetry({ level: 40, motorActive: true }).motorDirection, null);
  for (const input of [
    { level: 40, motorActive: false, motorDirection: 'up' },
    { level: 40, motorActive: true, motorDirection: 'stopped' },
    { level: 40, motorActive: true, motorDirection: 'invalid' },
  ])
    assert.throws(() => validateTelemetry(input));
});

test('controller timing budget decreases across polls without renewing a request', () => {
  let clock = Date.parse('2026-11-14T12:00:00Z');
  const lift = createLiftControl({ isFresh: () => true, onChange: () => {}, now: () => clock });
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).commandRemainingMs, null);
  const request = lift.request('up');
  const first = lift.controllerConfig(DEFAULT_CONFIG);
  assert.equal(first.commandId, request.requestedAt);
  assert.equal(first.commandRemainingMs, MOVE_DURATION_MS);
  clock += 4000;
  const later = lift.controllerConfig(DEFAULT_CONFIG);
  assert.equal(later.commandId, first.commandId);
  assert.equal(later.commandRemainingMs, MOVE_DURATION_MS - 4000);
  clock += MOVE_DURATION_MS;
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'stop');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).commandRemainingMs, null);
});
