# Architecture

FLOOD Lifting House uses Express and Socket.IO with a buildless browser interface. Backend and browser files use JavaScript ES modules. There is no framework build or bundling requirement.

## Request and event flow

1. ESP32 posts sensor readings to the HTTP API. The request is acknowledged only after the sensor/weather snapshot is stored in SQLite.
2. The telemetry store validates readings and calculates elevation using active calibration.
3. The route broadcasts a snapshot through Socket.IO and returns controller configuration.
4. Browser feature modules update the metrics, lift activity, and illustration.
5. Settings are validated, saved atomically, and broadcast to all connected dashboards.
6. Weather is fetched in parallel from the weather and river providers. Changing location invalidates in-flight data from the previous city.
7. On request, the analysis handler checks sensor freshness, fetches weather, and calls Gemini with both inputs.

## Responsibilities

- **src/server.js** loads the project-root environment, checks PORT, starts the server, and handles SIGINT/SIGTERM.
- **src/app.js** assembles services, HTTP routes, and socket handlers. Importing it does not start a server. It accepts replacement HTTP and AI functions and a settings path for deterministic tests.
- **config/** owns paths, defaults, and timing constants.
- **domain/validation.js** rejects invalid input and picks only explicitly allowed configuration fields.
- **routes/api.js** handles HTTP input/output; it delegates state and provider work to services.
- **realtime/dashboard.js** implements the browser event protocol and analysis preconditions.
- **services/** owns validated telemetry, configuration persistence, location lookup, provider requests, and AI feedback.
- **public/js/features/** owns each browser feature. Features receive their socket or location-picker dependency instead of sharing mutable global variables.

## State and secrets

The live telemetry/weather cache resets on restart. Every acknowledged sensor reading also persists with its matching weather snapshot in data/history.sqlite; it is queryable by date/time through /api/history and the Sensor history page. Nonsecret settings persist in data/config.json. Writes complete to a temporary file before rename, and active configuration changes only after successful persistence. Invalid saved settings fall back to validated defaults.

API keys stay in the server process. A dashboard-entered key lasts until restart; .env supplies a permanent startup key. Public configuration exposes only apiKeyConfigured. The key is never included in saved JSON or in the AI prompt's settings object.

This is a single-process, trusted-LAN prototype. Multiple backend instances would need shared state and coordination. Authentication, HTTPS, and request limiting are still needed for public hosting. The hardware controller remains responsible for all motor interlocks and travel limits.

## Extending the project

Add provider behavior under services/, validate new fields in domain/validation.js, and expose them through routes/ or realtime/ as needed. Add a browser feature under public/js/features/ and initialize it in public/js/app.js. Keep server code and secrets outside public/.

## Tests

Run npm test. Tests cover input rejection, height calibration, settings persistence and key omission, partial provider failures, stale-weather suppression, HTTP/static delivery, Socket.IO updates, analysis composition, city filtering and switching, and lift activity states. Provider calls and AI generation are stubbed; real credentials are unnecessary.

## Historical storage

The history service uses Node built-in SQLite (Node 22.13.0+), WAL journaling, parameterized statements, indexed receipt timestamps, and cursor pagination. No external database service or extra npm dependency is required. Sensor logging does not wait for weather requests; records capture the matching weather cache and indicate missing/stale data. The service picks explicit location and calibration fields and never persists API keys. History is not automatically pruned; back up the full data folder while the server is stopped and monitor disk usage.

## Manual lift control

The lift-control service owns a transient directional override and a 15-second movement deadline. Socket commands are validated separately from saved settings; /api/esp returns the override on the next controller poll. A one-second server timer expires movement to a latched Stop and broadcasts state to all dashboards. Stop bypasses the sensor freshness requirement. Command acceptance never changes actual sensor/motor telemetry. Controller firmware must implement direction, local deadline/watchdog handling, and hardware interlocks.
