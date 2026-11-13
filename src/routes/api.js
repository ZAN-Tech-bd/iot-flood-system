import { Router } from 'express';
import { listCities, searchLocations } from '../services/location-service.js';
export function createApiRouter({ config, telemetry, weather, history, lift, io, get }) {
  const router = Router();
  router.get('/history', (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      res.json(history.list(req.query));
    } catch (error) {
      res
        .status(error.code ? 503 : 400)
        .json({ error: error.code ? 'History storage unavailable.' : error.message });
    }
  });
  router.get('/cities', (req, res) => {
    try {
      res
        .set('Cache-Control', 'public, max-age=86400')
        .json(listCities(String(req.query.country || '')));
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });
  router.get('/locations', async (req, res) => {
    const query = String(req.query.q || '').trim(),
      country = String(req.query.country || '');
    if (query.length < 2 || query.length > 100 || !/^[A-Z]{2}$/.test(country))
      return res
        .status(400)
        .json({ error: 'Choose a country and enter at least two city letters.' });
    try {
      res.json(await searchLocations(query, country, get));
    } catch {
      res.status(502).json({ error: 'City search unavailable. Please retry.' });
    }
  });
  router.post('/esp', (req, res) => {
    let snapshot;
    try {
      snapshot = telemetry.preview(req.body);
    } catch (error) {
      return res.status(400).json({ error: error.message });
    }
    try {
      history.record(snapshot, config.get(), weather.current());
    } catch {
      return res
        .status(503)
        .json({ error: 'Could not save sensor log. Check server storage and retry.' });
    }
    telemetry.commit(snapshot);
    io.emit('dashboardUpdate', snapshot);
    const { mode, manualState, startLevel, stopLevel, maxHeightCm, baselineCm } = config.get();
    res.json(
      lift.controllerConfig({ mode, manualState, startLevel, stopLevel, maxHeightCm, baselineCm }),
    );
  });
  return router;
}
