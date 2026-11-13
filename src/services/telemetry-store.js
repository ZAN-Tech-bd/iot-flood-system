import { SENSOR_STALE_MS } from '../config/defaults.js';
import { validateTelemetry } from '../domain/validation.js';
export function createTelemetryStore(getConfig) {
  let reading = {
    sensorLevel: null,
    distanceCm: null,
    motorActive: null,
    motorDirection: null,
    updatedAt: null,
  };
  const snapshotOf = (value) => ({
    ...value,
    houseHeightCm:
      value.distanceCm === null ? null : Math.max(0, value.distanceCm - getConfig().baselineCm),
  });
  return {
    preview(input) {
      return snapshotOf(validateTelemetry(input));
    },
    commit(snapshot) {
      const { houseHeightCm: _height, ...accepted } = snapshot;
      reading = accepted;
    },
    update(input) {
      reading = validateTelemetry(input);
      return this.snapshot();
    },
    snapshot() {
      return snapshotOf(reading);
    },
    isFresh() {
      return (
        Boolean(reading.updatedAt) && Date.now() - Date.parse(reading.updatedAt) < SENSOR_STALE_MS
      );
    },
  };
}
