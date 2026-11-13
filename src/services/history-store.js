import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { HISTORY_FILE } from '../config/paths.js';

function parseDate(value, label, fallback) {
  if (value === undefined || value === '') return fallback;
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(value) ||
    !Number.isFinite(Date.parse(value))
  )
    throw new Error(`${label} must be an ISO timestamp with a timezone.`);
  return Date.parse(value);
}

export function createHistoryStore(file = HISTORY_FILE) {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recorded_at INTEGER NOT NULL,
      payload TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS readings_time ON readings(recorded_at, id);`);
  const insert = db.prepare('INSERT INTO readings (recorded_at, payload) VALUES (?, ?)');
  return {
    record(sensors, config, weather) {
      const recordedAt = sensors.updatedAt;
      const matches = weather?.lat === config.lat && weather?.lon === config.lon;
      const environment = matches ? weather : null;
      const weatherAgeSeconds = environment
        ? Math.max(
            0,
            Math.round((Date.parse(recordedAt) - Date.parse(environment.fetchedAt)) / 1000),
          )
        : null;
      const payload = {
        recordedAt,
        sensors,
        location: { city: config.city, country: config.country, lat: config.lat, lon: config.lon },
        baselineCm: config.baselineCm,
        weather: environment,
        weatherAgeSeconds,
        weatherStatus: !environment?.current
          ? 'unavailable'
          : weatherAgeSeconds > 1200
            ? 'stale'
            : 'available',
      };
      const result = insert.run(Date.parse(recordedAt), JSON.stringify(payload));
      return { id: Number(result.lastInsertRowid), ...payload };
    },
    list(query = {}) {
      const from = parseDate(query.from, 'From', 0);
      const to = parseDate(query.to, 'To', 8640000000000000);
      if (from > to) throw new Error('From must be before To.');
      const limit = query.limit === undefined ? 50 : Number(query.limit);
      const before = query.before === undefined ? Number.MAX_SAFE_INTEGER : Number(query.before);
      if (!Number.isSafeInteger(limit) || limit < 1 || limit > 200)
        throw new Error('Limit must be between 1 and 200.');
      if (!Number.isSafeInteger(before) || before < 1) throw new Error('Invalid history cursor.');
      const rows = db
        .prepare(
          'SELECT id, payload FROM readings WHERE recorded_at >= ? AND recorded_at <= ? AND id < ? ORDER BY id DESC LIMIT ?',
        )
        .all(from, to, before, limit + 1);
      const hasMore = rows.length > limit;
      const items = rows.slice(0, limit).map((row) => ({ id: row.id, ...JSON.parse(row.payload) }));
      return { items, nextCursor: hasMore ? items.at(-1).id : null };
    },
    close() {
      db.close();
    },
  };
}
