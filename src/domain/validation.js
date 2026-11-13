import { DEFAULT_CONFIG } from '../config/defaults.js';
export function validateConfig(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid settings.');
  const next = Object.fromEntries(Object.keys(DEFAULT_CONFIG).map((key) => [key, input[key]]));
  if (
    !Number.isFinite(next.startLevel) ||
    !Number.isFinite(next.stopLevel) ||
    next.stopLevel < 0 ||
    next.startLevel > 100 ||
    next.stopLevel >= next.startLevel
  )
    throw new Error('Start level must exceed stop level within 0–100%.');
  if (!['auto', 'manual'].includes(next.mode) || typeof next.manualState !== 'boolean')
    throw new Error('Invalid lift mode.');
  if (
    !Number.isFinite(next.baselineCm) ||
    next.baselineCm < 0 ||
    next.baselineCm > 1000 ||
    !Number.isFinite(next.maxHeightCm) ||
    next.maxHeightCm <= 0 ||
    next.maxHeightCm > 1000
  )
    throw new Error('Check baseline and maximum height (up to 1000 cm).');
  if (
    typeof next.city !== 'string' ||
    !next.city.trim() ||
    next.city.length > 100 ||
    typeof next.country !== 'string' ||
    !next.country.trim() ||
    next.country.length > 100 ||
    !/^[A-Z]{2}$/.test(next.countryCode) ||
    !Number.isFinite(next.lat) ||
    Math.abs(next.lat) > 90 ||
    !Number.isFinite(next.lon) ||
    Math.abs(next.lon) > 180
  )
    throw new Error('Select a city from the dropdown.');
  if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 256))
    throw new Error('Invalid API key.');

  return next;
}
export function validateTelemetry(input) {
  if (!input || typeof input !== 'object') throw new Error('Invalid telemetry.');
  const { level, distanceCm, motorActive, motorDirection } = input;
  for (const key of ['upperLimit', 'lowerLimit']) {
    if (input[key] != null && typeof input[key] !== 'boolean')
      throw new Error(`${key} must be a boolean.`);
  }
  if (
    motorDirection != null &&
    (!['up', 'down', 'stopped'].includes(motorDirection) ||
      (motorActive === false && motorDirection !== 'stopped') ||
      (motorActive === true && motorDirection === 'stopped'))
  )
    throw new Error(
      'motorDirection must match motorActive: up/down when running, stopped when off.',
    );
  if (
    !Number.isFinite(level) ||
    level < 0 ||
    level > 100 ||
    typeof motorActive !== 'boolean' ||
    (distanceCm != null && (!Number.isFinite(distanceCm) || distanceCm < 0 || distanceCm > 1000))
  )
    throw new Error('Send level (0–100), motorActive (boolean), and optional distanceCm (0–1000).');
  return {
    sensorLevel: level,
    distanceCm: distanceCm ?? null,
    motorActive,
    motorDirection: motorDirection ?? null,
    upperLimit: input.upperLimit ?? null,
    lowerLimit: input.lowerLimit ?? null,
    updatedAt: new Date().toISOString(),
  };
}
