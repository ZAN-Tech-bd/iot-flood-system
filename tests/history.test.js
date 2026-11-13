import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { createHistoryStore } from '../src/services/history-store.js';
import { DEFAULT_CONFIG } from '../src/config/defaults.js';
const sensors = {
  sensorLevel: 42,
  distanceCm: 95.5,
  houseHeightCm: 75.5,
  motorActive: true,
  updatedAt: '2026-11-14T12:00:00.000Z',
};
const environment = {
  lat: DEFAULT_CONFIG.lat,
  lon: DEFAULT_CONFIG.lon,
  current: { temperature_2m: 26, relative_humidity_2m: 75 },
  fetchedAt: '2026-11-14T11:55:00.000Z',
  riverDischarge: 12,
};
test('sensor/weather snapshots persist after restart and preserve original calibration and location', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'flood-history-test-')),
    file = join(directory, 'history.sqlite');
  let store;
  try {
    store = createHistoryStore(file);
    store.record(sensors, { ...DEFAULT_CONFIG, apiKey: 'private' }, environment);
    store.close();
    store = createHistoryStore(file);
    const [row] = store.list().items;
    assert.equal(row.sensors.sensorLevel, 42);
    assert.equal(row.sensors.houseHeightCm, 75.5);
    assert.equal(row.location.city, 'Dhaka');
    assert.equal(row.baselineCm, 20);
    assert.equal(row.weather.current.temperature_2m, 26);
    assert.equal(row.weatherAgeSeconds, 300);
    assert.equal(row.weatherStatus, 'available');
    assert.ok(!JSON.stringify(row).includes('private'));
  } finally {
    store?.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    await rm(directory, { recursive: true, force: true });
  }
});
test('inclusive timezone-aware date filters and stable pagination include every row with identical timestamps', () => {
  const store = createHistoryStore(':memory:');
  try {
    store.record({ ...sensors, updatedAt: '2026-11-13T23:59:59.999Z' }, DEFAULT_CONFIG, null);
    for (let i = 0; i < 3; i++) store.record(sensors, DEFAULT_CONFIG, environment);
    const range = { from: '2026-11-14T18:00:00+06:00', to: sensors.updatedAt, limit: 2 };
    const first = store.list(range);
    assert.equal(first.items.length, 2);
    assert.ok(first.nextCursor);
    const second = store.list({ ...range, before: first.nextCursor });
    assert.equal(second.items.length, 1);
    assert.equal(second.nextCursor, null);
    assert.equal(new Set([...first.items, ...second.items].map((row) => row.id)).size, 3);
    assert.equal(store.list({ from: '2026-11-15T00:00:00Z' }).items.length, 0);
    for (const query of [
      { from: 'invalid' },
      { from: '2026-11-15T00:00:00Z', to: sensors.updatedAt },
      { limit: 201 },
      { before: 'bad' },
      { limit: 0 },
    ])
      assert.throws(() => store.list(query));
  } finally {
    store.close();
  }
});
test('missing, stale, and wrong-location weather are labeled without losing sensor records', () => {
  const store = createHistoryStore(':memory:');
  try {
    assert.equal(store.record(sensors, DEFAULT_CONFIG, null).weatherStatus, 'unavailable');
    const mismatched = store.record(sensors, DEFAULT_CONFIG, { ...environment, lat: 0 });
    assert.equal(mismatched.weather, null);
    assert.equal(
      store.record(sensors, DEFAULT_CONFIG, { ...environment, fetchedAt: '2026-11-14T10:00:00Z' })
        .weatherStatus,
      'stale',
    );
    assert.equal(
      store.record(sensors, DEFAULT_CONFIG, { ...environment, current: null, error: 'Offline' })
        .weatherStatus,
      'unavailable',
    );
    assert.equal(store.list().items.length, 4);
  } finally {
    store.close();
  }
});
