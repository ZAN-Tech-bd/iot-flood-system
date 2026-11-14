# API reference

Base URL: http://localhost:3000. This prototype expects a trusted local network and does not implement authentication.

## HTTP endpoints

| Method | Path                              | Purpose                                                                                    |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | /api/cities?country=BD            | All directory entries with coordinates for a two-letter country code; cached for 24 hours. |
| GET    | /api/locations?q=Dhaka&country=BD | Open-Meteo city-name search; query must contain 2–100 characters.                          |
| POST   | /api/esp                          | Validate telemetry, broadcast dashboardUpdate, and acknowledge the upload.                 |

City results include city, region, country, countryCode, lat, and lon; online results also include the provider id. Directory coverage is not a guarantee of every settlement.

### Telemetry payload

```json
{ "level": 42, "distanceCm": 95.5, "motorActive": true }
```

level is a finite number from 0–100. motorActive must be a boolean. distanceCm is optional or null and otherwise a finite number from 0–1000. Missing distance means unavailable elevation, not zero elevation.

The response contains ok, controlMode=local, liftCommand and commandId (both null until a dashboard request). It does not supply the sensor thresholds or local safety configuration. Invalid telemetry or JSON returns 400, oversized JSON returns 413, and logging failure returns 503. Firmware treats HTTP as optional telemetry upload and continues local control on errors.

## Socket.IO events

| Direction        | Event           | Payload / result                                                                                  |
| ---------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| Server → browser | configUpdate    | Nonsecret configuration plus apiKeyConfigured. Sent on connection and successful save.            |
| Server → browser | dashboardUpdate | sensorLevel, distanceCm, motorActive, updatedAt, houseHeightCm.                                   |
| Server → browser | weatherUpdate   | location, fetchedAt, current weather, riverDischarge, error; null during location refresh.        |
| Browser → server | updateConfig    | Full configuration and optional apiKey; acknowledgement is { ok: true } or { error }.             |
| Browser → server | refreshWeather  | Empty object; acknowledges when the refresh completes. Inspect weatherUpdate for provider errors. |
| Browser → server | requestAnalysis | No payload. Result arrives through analysisResult.                                                |
| Server → browser | analysisResult  | text, generatedAt, sensorAt, weatherAt; on failure, error instead.                                |

Configuration fields: city, country, countryCode, lat, lon, startLevel, stopLevel, mode (auto/manual), manualState, baselineCm, maxHeightCm. stopLevel must be less than startLevel within 0–100. Calibration is 0–1000 cm; maximum travel must be greater than zero and at most 1000 cm.

AI feedback requires a key, sensor data younger than 30 seconds, and current weather. Server telemetry is authoritative for displayed motor activity; changing manualState alone never marks the house as lifting. After 30 seconds without telemetry, the browser shows the lift status as unavailable.

## Persistent sensor/weather history

Every valid, acknowledged telemetry POST is written to data/history.sqlite. A storage failure returns 503. Invalid telemetry is never stored. The latest matching weather snapshot is attached without making a blocking provider request per sensor reading. Weather is refreshed at startup and every 10 minutes.

GET /api/history accepts optional from and to ISO timestamps with timezone, inclusive; limit (1–200, default 50); and before (a positive row ID for pagination). The response is { items, nextCursor }. Pass nextCursor as before with the same filters to read older rows; null means the last page. An invalid filter returns 400.

Each row has id, recordedAt, sensors, location, baselineCm, weather, weatherAgeSeconds, and weatherStatus (available, stale, or unavailable). Sensor receipt timestamps are UTC. Weather preserves its fetch time and provider observation time, timezone and UTC offset when available. Weather older than 20 minutes since fetch is marked stale; unavailable or wrong-location data never masquerades as a current observation. Historical settings, sensor readings, and weather snapshots remain unchanged after future updates.

Logs require Node.js 22.13.0+ for embedded SQLite. Stop the server before copying the complete data folder for backup; keep SQLite companion files with the database. API keys are never included in log rows.

## Local motor control with optional dashboard commands

All movement logic runs on the ESP32 and its physical buttons. The server can return optional manual commands; automatic motion remains local. Socket.IO liftCommand accepts up/down/stop and acknowledges with { ok: true, command: { action, id } }. Up/Down require fresh telemetry; Stop is always accepted. liftCommandUpdate broadcasts the request.

POST /api/esp accepts optional waterRaw (integer 0-4095), upperLimit/lowerLimit (booleans), and motorDirection (up/down while motorActive=true, stopped when false). Missing optional readings are null. Raw water values are stored and broadcast unchanged: raw 1 remains 1 even if calibrated level is 0%. ESP32 chooses Up only when raw > 0 AND level > 0, otherwise Down, subject to local interlocks and button overrides.

Responses use Cache-Control: no-store. New dashboard command IDs apply once; repeated polls do not restart a locally cancelled command. Local height calibration is compiled into firmware config.h. Server baselineCm affects displayed and logged elevation only; legacy threshold/mode fields remain accepted for compatibility but cannot control the ESP32. See [hardware behavior and offline checks](hardware.md).
