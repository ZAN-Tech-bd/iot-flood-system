import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTelemetry } from '../src/domain/validation.js';

test('raw ADC stays independent of calibrated percentage for local control telemetry', () => {
  const sample = validateTelemetry({
    level: 0,
    waterRaw: 1,
    motorActive: true,
    motorDirection: 'up',
  });
  assert.equal(sample.sensorLevel, 0);
  assert.equal(sample.waterRaw, 1);
  assert.equal(sample.motorDirection, 'up');
  assert.equal(validateTelemetry({ level: 0, motorActive: false }).waterRaw, null);
  for (const waterRaw of [-1, 4096, 0.5, '12'])
    assert.throws(() => validateTelemetry({ level: 0, waterRaw, motorActive: false }));
});

test('reported motor direction and limit input types remain validated', () => {
  for (const extra of [{ motorDirection: 'up' }, { upperLimit: 'yes' }, { lowerLimit: 1 }])
    assert.throws(() => validateTelemetry({ level: 0, motorActive: false, ...extra }));
  assert.equal(
    validateTelemetry({ level: 0, motorActive: false, motorDirection: 'stopped', lowerLimit: true })
      .lowerLimit,
    true,
  );
});

test('optional commands keep their ID across polling and do not require a timed movement window', async () => {
  const { createLiftControl } = await import('../src/services/lift-control.js');
  let fresh = false;
  const lift = createLiftControl({ isFresh: () => fresh, onChange: () => {} });
  assert.equal(lift.current().action, null);
  assert.throws(() => lift.request('up'), /fresh/);
  assert.equal(lift.request('stop').action, 'stop');
  fresh = true;
  const up = lift.request('up');
  assert.deepEqual(lift.current(), up);
  assert.equal('expiresAt' in up, false);
  const down = lift.request('down');
  assert.notEqual(down.id, up.id);
  assert.equal(down.action, 'down');
});
