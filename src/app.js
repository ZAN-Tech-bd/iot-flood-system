import { createLiftControl } from './services/lift-control.js';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { PUBLIC_DIRECTORY } from './config/paths.js';
import { WEATHER_REFRESH_MS } from './config/defaults.js';
import { createConfigStore } from './services/config-store.js';
import { createTelemetryStore } from './services/telemetry-store.js';
import { createWeatherService } from './services/weather-service.js';
import { generateFeedback } from './services/analysis-service.js';
import { createApiRouter } from './routes/api.js';
import { registerDashboard } from './realtime/dashboard.js';
import { join, dirname } from 'node:path';
import { createHistoryStore } from './services/history-store.js';
// Dependencies can be replaced in tests; importing the app never binds a port.
export async function createApplication(options = {}) {
  const app = express();
  app.disable('x-powered-by');
  const server = createServer(app);
  const io = new Server(server);
  const config = await createConfigStore({ file: options.configFile, apiKey: options.apiKey });
  const telemetry = createTelemetryStore(config.get);
  const lift = createLiftControl({
    isFresh: telemetry.isFresh,
    onChange: (command) => io.emit('liftCommandUpdate', command),
  });
  const history = createHistoryStore(
    options.historyFile ||
      (options.configFile ? join(dirname(options.configFile), 'history.sqlite') : undefined),
  );
  const weather = createWeatherService({
    getConfig: config.get,
    onUpdate: (data) => io.emit('weatherUpdate', data),
    get: options.httpGet,
  });
  app.use(express.json({ limit: '16kb' }));
  app.use(
    '/api',
    createApiRouter({ config, telemetry, weather, history, lift, io, get: options.httpGet }),
  );
  app.use(express.static(PUBLIC_DIRECTORY));
  app.use('/api', (_req, res) => res.status(404).json({ error: 'API endpoint not found.' }));
  app.use((error, _req, res, _next) => {
    const status = error.status === 400 ? 400 : error.status === 413 ? 413 : 500;
    res.status(status).json({
      error:
        status === 400
          ? 'Invalid JSON request body.'
          : status === 413
            ? 'Request body too large.'
            : 'Unexpected server error.',
    });
  });
  registerDashboard(io, {
    lift,
    config,
    telemetry,
    weather,
    generateFeedback: options.generateFeedback || generateFeedback,
    model: options.model || 'gemini-2.5-flash',
  });
  const timer = setInterval(() => {
    void weather.refresh();
  }, WEATHER_REFRESH_MS);
  timer.unref();
  void weather.refresh();
  return {
    app,
    server,
    io,
    config,
    telemetry,
    weather,
    history,
    async close() {
      clearInterval(timer);
      await new Promise((resolve) => io.close(resolve));
      history.close();
    },
  };
}
