# API reference

Base URL: http://localhost:3000. This prototype expects a trusted local network and does not implement authentication.

## HTTP endpoints

| Method | Path                              | Purpose                                                                                    |
| ------ | --------------------------------- | ------------------------------------------------------------------------------------------ |
| GET    | /api/cities?country=BD            | All directory entries with coordinates for a two-letter country code; cached for 24 hours. |
| GET    | /api/locations?q=Dhaka&country=BD | Open-Meteo city-name search; query must contain 2–100 characters.                          |
| POST   | /api/esp                          | Validate telemetry, broadcast dashboardUpdate, and return controller settings.             |

City results include city, region, country, countryCode, lat, and lon; online results also include the provider id. Directory coverage is not a guarantee of every settlement.

### Telemetry payload

```json
{ "level": 42, "distanceCm": 95.5, "motorActive": true }
```

level is a finite number from 0–100. motorActive must be a boolean. distanceCm is optional or null and otherwise a finite number from 0–1000. Missing distance means unavailable elevation, not zero elevation.

The response contains mode, manualState, startLevel, stopLevel, maxHeightCm, and baselineCm. Invalid telemetry or JSON returns status 400. Oversized JSON returns 413. City-provider failure returns 502. Error responses have an error string.

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

## Manual lift commands

Browser → server: liftCommand with { action: 'up' | 'down' | 'stop' }, acknowledged with { ok: true, command } or { error }. Server → all dashboards: liftCommandUpdate with action, requestedAt and expiresAt. A new connection receives the current command; action=null means no dashboard override. Up/Down require fresh telemetry and expire to Stop after 15 seconds. Stop is allowed with stale telemetry. Stop is required before reversing direction. These commands override saved mode until server restart and are never persisted.

POST /api/esp responses now include liftCommand (auto/up/down/stop) and commandExpiresAt (UTC timestamp or null). During a dashboard override mode=manual. The legacy manualState boolean is true only for Up; it is false for Down and Stop. Direction-aware firmware must use liftCommand, enforce the deadline and its own local watchdog, and implement motor reversal interlocks.

Telemetry optionally includes motorDirection: up/down when motorActive=true, stopped when motorActive=false, or null/omitted when unknown. Invalid or inconsistent directions return 400. Reported motor direction is independent of the requested command and is included in persisted sensor snapshots. Without direction telemetry, the UI displays a running motor without claiming upward or downward movement.

### ESP32 command timing

Responses also include commandId (the dashboard request timestamp, or null) and commandRemainingMs (remaining UTC deadline budget in milliseconds, or null without an expiring override). The ESP32 subtracts the request round-trip duration and enforces the remainder with millis(), avoiding clock synchronization. A null budget still requires the local 15-second movement window and communication watchdog. Repeated polls of a command must not reset that window. Responses are marked Cache-Control: no-store. See [firmware setup and behavior](hardware.md).

Telemetry may include boolean `upperLimit` and `lowerLimit` fields (null/omitted means unknown). The ESP32 reports its active-low GPIO 16 and GPIO 4 switches. A reported limit cancels a matching manual command to Stop; firmware stops locally first. The dashboard displays “Upper limit reached · lifting stopped” or “Lower limit reached · lifting stopped” after stopped feedback, disables movement toward that switch, and allows movement away from it. Reflash the ESP32 to enable limit reporting.
