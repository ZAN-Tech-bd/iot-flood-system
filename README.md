# FLOOD Lifting House

DPI MODEL — FLOOD-PROOF HYDRAULIC FARM & PROJECT SYSTEM A Smart Dynamic-Elevation Business & Farm Solution for Flood-Prone Regions

![DPI project team logo](public/assets/images/team-logo.png)

A local dashboard for a house mounted on a vertical lift. It shows water level, ultrasonic distance, calculated house height, motor status, weather, Gemini feedback, and persistent sensor/weather history.

## Set up on another PC: step by step

### Step 1 — Install Node.js

1. Download Node.js from [nodejs.org](https://nodejs.org/en/download). Install a supported version **22.13.0 or newer**, including npm.
2. Close and reopen your terminal after installation.
3. Check both commands:

```powershell
node --version
npm.cmd --version
```

On macOS/Linux, use `npm --version`. Node 22.13+ is required for the built-in SQLite history database. Node 22 may print an experimental SQLite warning; this does not stop the application. See the [Node SQLite documentation](https://nodejs.org/download/release/v22.13.1/docs/api/sqlite.html).

### Step 2 — Transfer the project

Copy or ZIP the project folder to the new PC, for example `C:\Projects\flood-lifting-house`.

Include:

- `src/`, `public/`, `docs/`, and `tests/`.
- `package.json` and **`package-lock.json`**.
- `README.md`, `.env.example`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, and `.prettierignore`.

Do not copy `node_modules/`; the new PC installs its own dependencies. Create a new `.env` in Step 4 rather than sharing a folder containing API keys. A fresh setup does not require `data/`; the app creates it automatically.

To keep your existing location settings and history, follow **Back up or move existing data** below before starting the new installation.

### Step 3 — Open the project and install dependencies

Open PowerShell in the project folder, or run the following with your actual path:

```powershell
cd "C:\Projects\flood-lifting-house"
npm.cmd ci
```

Wait for installation to finish. Internet access is required to download packages. Use `npm.cmd` on Windows if PowerShell blocks `npm.ps1`.

On macOS/Linux:

```sh
cd /your/path/flood-lifting-house
npm ci
```

### Step 4 — Create your environment file

On a new Windows installation:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux:

```sh
cp .env.example .env
```

Skip this copy if `.env` already exists and you want to keep it. Open `.env` in an editor:

```dotenv
PORT=3000
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

Get a key from [Google AI Studio](https://aistudio.google.com/apikey). You can leave `GEMINI_API_KEY` empty and add it later in Settings. A dashboard-entered key lasts until the server restarts; a `.env` key loads on every startup. Never commit `.env` or publish a key.

Weather and online city search use Open-Meteo and do not need a Gemini key. Review Open-Meteo's terms for commercial use. Gemini needs an accessible model and sufficient quota.

### Step 5 — Start the server

```powershell
npm.cmd start
```

On macOS/Linux use `npm start`.

Open **http://localhost:3000** in a browser on that PC. Keep the terminal running. Ctrl+C stops the server. To run the project again later, open the project folder and run the same start command; you do not need to reinstall dependencies each time.

If you change `PORT` in `.env`, restart the server and use the new port in the browser and controller URL. Restart after any `.env` change.

### Step 6 — Set location and Gemini connection

1. Open **Settings**.
2. Select the country. Its bundled city directory loads automatically.
3. Pick a city. Type to filter the directory, or use **Search online** for a missing place.
4. Enter a Gemini key if you did not configure one in `.env`.
5. Click **Save configuration**.
6. Return to **Overview** and check the local weather.

Settings contains location and Gemini connection only. Internal lift thresholds, mode, and calibration remain in `src/config/defaults.js`, overridden by existing `data/config.json` values. These internal values are preserved when saving dashboard settings.

### Step 7 — Connect the ESP32/controller to the new PC

ESP32-WROOM-32 firmware is included in `firmware/esp32_controller/`. Follow the [wiring, flashing and calibration guide](docs/hardware.md), then use the [API reference](docs/api.md) for protocol details.

1. Connect the PC and controller to the same trusted local network.
2. On Windows, run `ipconfig` and find the active Wi-Fi/Ethernet adapter's IPv4 address, for example `192.168.1.25`.
3. Configure the controller's server URL as `http://192.168.1.25:3000/api/esp`, replacing the example IP and port.
4. If Windows Firewall prompts, allow Node.js on the private network. If the controller cannot connect, check the PC's firewall settings for that port.
5. Send HTTP POST JSON every 2–5 seconds with `Content-Type: application/json`:

```json
{
  "level": 42,
  "distanceCm": 95.5,
  "motorActive": false
}
```

Use the new PC's LAN address on the controller, **not `localhost`**. Another device's `localhost` refers to that device. Update the controller URL if the PC's network address changes. The dashboard is also available from another device at `http://PC_LAN_IP:3000` while the server runs.

| Field         | Meaning                                                              |
| ------------- | -------------------------------------------------------------------- |
| `level`       | Water sensor percentage, a number from 0–100.                        |
| `distanceCm`  | Ultrasonic distance, 0–1000 cm. Optional or null on an invalid echo. |
| `motorActive` | Boolean representing the motor's actual state.                       |

Mount the ultrasonic sensor on the house facing down toward a fixed ground reference. House elevation is `max(0, distanceCm - baselineCm)`. With a 20 cm baseline and 95.5 cm distance, height is 75.5 cm. A sensor pointing at changing water measures water clearance rather than ground-relative elevation.

The controller receives `mode`, `manualState`, `liftCommand`, `commandExpiresAt`, `startLevel`, `stopLevel`, `maxHeightCm`, and `baselineCm` in the response. Implement travel limits, motor interlocks, emergency stop, limit switches, and sensor failure handling on the controller. Gemini never controls the motor.

### Step 8 — Verify the installation

Check that sensor values change in Overview and that the lifting indicator follows the actual motor state. Without hardware, you can inject **one example reading** from the PC:

```powershell
Invoke-RestMethod -Uri http://localhost:3000/api/esp -Method Post -ContentType 'application/json' -Body '{"level":42,"distanceCm":95.5,"motorActive":false}'
```

This creates a real saved log containing example values. Do not confuse it with a physical measurement. If no further reading arrives within 30 seconds, live sensor status becomes stale.

Open **Sensor history**, click **Today** or **All dates**, and confirm that a row appears. Restart the server and reopen history to confirm the log remains saved. Gemini feedback requires a key, fresh sensor data, and available current weather.

## Dashboard lift controls

### Control a real controller

The dashboard uses actual controller feedback for house height and animation. Up, Down and Stop are connected to the server command system. The included [ESP32 firmware](docs/hardware.md) implements the direction-aware command and telemetry fields described below without physical direction buttons. Until the controller connects, Up and Down stay disabled and measurements remain unavailable.

Overview has **Up**, **Down**, and **Stop** buttons. Up and Down require controller readings younger than 30 seconds. Stop can be sent even when readings are stale, provided the dashboard is connected to the server. Acknowledgement means the server accepted the request; actual motion is reported separately by the controller.

- Up/Down override automatic operation for at most **15 seconds per click**, then the server requests Stop. Click again for another movement window.
- Press Stop before reversing direction. Stop latches the dashboard override in manual mode.
- Dashboard commands live in server memory. Restart clears them and returns to the saved configuration. Saving location or Gemini settings does not clear an active command.
- The controller receives liftCommand (up/down/stop/auto) and commandExpiresAt in its next POST /api/esp response. The included firmware implements both directions and local travel limits.
- Report optional motorDirection: up or down while motorActive is true, and stopped while false. Without direction feedback the UI says “Lift motor running” rather than assuming direction.

Older controllers that only read manualState can still lift with Up and halt with Stop, but **cannot lower using Down**. Down deliberately sends manualState=false so an older lift-only controller cannot raise the house accidentally. Updated firmware must use liftCommand for direction, stop locally when commandExpiresAt is reached, enforce a local maximum 15-second movement window, and stop if server polling fails. This browser control is not a substitute for a hardware emergency stop, travel switches, or reversing interlocks.

## Sensor and weather history

Every valid, successfully accepted `POST /api/esp` is saved to **`data/history.sqlite`** before the server acknowledges it. A controller retry can create another reading; this protocol has no device-provided deduplication ID. Invalid inputs are rejected and do not create rows. A storage failure returns HTTP 503 rather than silently acknowledging an unsaved log.

Each record contains:

- Server receipt date/time, water percentage, ultrasonic distance, calculated house height, and actual motor status.
- The city, country, coordinates, and baseline in effect at receipt.
- The latest weather snapshot for those coordinates: temperature, precipitation, wind, humidity, weather code, and modeled river discharge when available.
- Weather fetch timestamp, provider observation time when available, snapshot age, and availability/staleness status.

Weather is fetched at startup, every 10 minutes, and on manual refresh. Logging uses the latest matching snapshot already available, so a sensor update does not wait for a weather API request. A reading received before the first successful weather fetch, or during an outage/location change, may have unavailable weather. A snapshot fetched more than 20 minutes earlier is marked stale. Snapshot age measures time since fetch; the weather provider's observation time is stored separately. River discharge is modeled, not a local flood-depth measurement.

Historical rows keep their original data when settings change. Logging begins after installing this feature; earlier sensor readings cannot be recovered automatically.

### View readings by date and time

1. Open **Sensor history** in the sidebar.
2. Use **Today**, or choose **From date & time** and **To date & time**.
3. Click **Apply / Refresh**.
4. Browse **Older** and **Newer** pages of 50 rows, or use **All dates** to remove date limits.
5. Refresh to include new readings. Scroll the table sideways on smaller screens to see all weather columns.

Timestamps are stored in UTC. Filters and displayed receipt/fetch times use the browser's timezone, shown above the table. The To filter includes the full selected second. Weather observation time is shown in the location's timezone. Set the new PC's date, time, and timezone correctly before logging.

Logs survive server restarts. There is no automatic log deletion; monitor disk usage and back up the data folder. SQLite is embedded in Node.js, so no separate database server is needed.

## Back up or move existing data

1. Stop the server with Ctrl+C and wait for it to exit before copying the database.
2. Copy the entire **`data/`** folder to your backup or the same project root on the new PC. It contains `config.json`, `history.sqlite`, and potentially SQLite `-wal`/`-shm` companion files. Keep the whole set together.
3. Keep a separate secure backup of `.env` if you need the same API key; otherwise create a new one using Step 4.
4. On the new PC, run `npm.cmd ci`, configure `.env`, then `npm.cmd start`.
5. Confirm the location settings and Sensor history, and update the controller's LAN server address.

A Git clone does not include `data/` or `.env` because both are ignored. Copying only the source code starts a new history database. Do not replace the data folder of a running server or merge database files manually.

## Troubleshooting

| Problem                      | Check                                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------ |
| `node` or `npm` not found    | Install Node.js and reopen the terminal.                                                   |
| `npm.ps1` blocked            | Use `npm.cmd` on Windows.                                                                  |
| `node:sqlite` unavailable    | Upgrade to Node.js 22.13.0 or newer.                                                       |
| Port already in use          | Stop the other instance or change `PORT`; update browser/controller URLs.                  |
| No sensor data               | Check controller URL, Wi-Fi, firewall, and JSON field types.                               |
| Sensor stale / motor unknown | No fresh reading within 30 seconds, or server connection lost.                             |
| No history rows              | Check Today/All dates, PC clock/timezone, and whether valid telemetry is arriving.         |
| HTTP 503 on telemetry        | Check disk space and permission to write the project's `data/` folder.                     |
| Weather unavailable          | Check internet access and refresh. Sensor records still save with missing weather labeled. |
| Wrong house height           | Check downward sensor mounting and the baseline in the saved configuration.                |
| Gemini failed                | Check key, model access, quota, internet, and fresh sensor/weather data.                   |

This prototype has no authentication. Use it on a trusted local network; add authentication, HTTPS, and request limits before public hosting. Use independent engineered safety controls for a physical lift.

## Project structure

```text
src/
  server.js             Environment loading, startup, shutdown
  app.js                Application assembly
  config/               Defaults, paths, timing constants
  domain/               Input validation
  routes/               HTTP API, including history queries
  realtime/             Socket.IO handlers
  services/             Configuration, telemetry, history, locations, weather, Gemini
public/
  index.html
  assets/images/        Project team logo
  css/                  Styles
  js/features/          Overview, settings, locations, history, weather, feedback
  js/lib/               Shared browser helpers
  js/app.js             Browser entry point
tests/                  Automated tests using isolated temporary data
docs/                   Architecture, API, hardware notes
data/                   Local settings and SQLite history; ignored by Git
.env.example            Configuration template
package.json            Commands and dependencies
package-lock.json       Reproducible dependency versions
```

## Development commands

```powershell
npm.cmd run dev
npm.cmd test
npm.cmd run format:check
npm.cmd run format
```

Development mode restarts the backend after source edits; refresh the browser after frontend edits. Tests use isolated temporary files, a test document for browser behavior, and fake weather/AI responses. They do not require sensors or a real API key and do not replace visual browser testing. A runtime-only installation can use `npm.cmd ci --omit=dev`; tests and formatting tools are intended for the full installation.

See [architecture](docs/architecture.md), [API reference](docs/api.md), and [hardware integration](docs/hardware.md).

Provider references: [Open-Meteo weather](https://open-meteo.com/en/docs), [geocoding](https://open-meteo.com/en/docs/geocoding-api), [flood model](https://open-meteo.com/en/docs/flood-api), [Gemini JavaScript SDK](https://googleapis.github.io/js-genai/), and [country-state-city directory](https://github.com/harpreetkhalsagtbit/country-state-city). The directory is not a guarantee of every settlement.
