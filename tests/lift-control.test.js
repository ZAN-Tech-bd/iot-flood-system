import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiftControl } from '../src/services/lift-control.js';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';
import { validateTelemetry } from '../src/domain/validation.js';

test('manual movement has no deadline; repeated direction toggles Stop and reversing requires Stop', () => {
  let fresh = true,
    clock = Date.now();
  const lift = createLiftControl({ isFresh: () => fresh, onChange: () => {}, now: () => clock });
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'auto');
  const up = lift.request('up');
  assert.equal(up.expiresAt, null);
  clock += 3600000;
  assert.equal(lift.current().action, 'up');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).commandRemainingMs, null);
  assert.throws(() => lift.request('down'), /Stop/);
  assert.equal(lift.request('up').action, 'stop');
  assert.equal(lift.request('down').action, 'down');
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).manualState, false);
  assert.equal(lift.request('down').action, 'stop');
  fresh = false;
  assert.throws(() => lift.request('up'), /fresh/);
  assert.equal(lift.request('stop').action, 'stop');
  assert.throws(() => lift.request('sideways'), /Choose/);
});

test('Stop holds through polls and resumes automatic mode only on a wet/dry transition', () => {
  const lift = createLiftControl({ isFresh: () => true, onChange: () => {} });
  lift.observeLevel(5);
  lift.request('stop');
  lift.observeLevel(20);
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'stop');
  lift.observeLevel(0);
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'auto');
  lift.request('stop');
  lift.observeLevel(0);
  assert.equal(lift.current().action, 'stop');
  lift.observeLevel(0.1);
  assert.equal(lift.controllerConfig(DEFAULT_CONFIG).liftCommand, 'auto');
  assert.equal(
    createLiftControl({ isFresh: () => true, onChange: () => {} }).current().action,
    null,
  );
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
