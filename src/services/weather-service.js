import { httpGet } from './http-client.js';
export function createWeatherService({ getConfig, onUpdate, get = httpGet }) {
  let weather = null,
    weatherTask = null,
    revision = 0;
  async function refresh() {
    if (weatherTask) return weatherTask;
    const location = getConfig(),
      version = revision;
    weatherTask = (async () => {
      const params = { latitude: location.lat, longitude: location.lon };
      const [forecast, flood] = await Promise.allSettled([
        get('https://api.open-meteo.com/v1/forecast', {
          ...params,
          current: 'temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m,weather_code',
          timezone: 'auto',
        }),
        get('https://flood-api.open-meteo.com/v1/flood', {
          ...params,
          daily: 'river_discharge',
          forecast_days: 1,
        }),
      ]);
      if (version !== revision) return null;
      weather = {
        lat: location.lat,
        lon: location.lon,
        timezone: forecast.status === 'fulfilled' ? (forecast.value.data.timezone ?? null) : null,
        utcOffsetSeconds:
          forecast.status === 'fulfilled' ? (forecast.value.data.utc_offset_seconds ?? null) : null,
        location: `${location.city}, ${location.country}`,
        fetchedAt: new Date().toISOString(),
        current: forecast.status === 'fulfilled' ? forecast.value.data.current : null,
        riverDischarge:
          flood.status === 'fulfilled'
            ? (flood.value.data.daily?.river_discharge?.[0] ?? null)
            : null,
        error:
          forecast.status === 'rejected' ? 'Weather provider unavailable. Please refresh.' : null,
      };
      onUpdate(weather);
      return weather;
    })().finally(() => {
      weatherTask = null;
    });
    return weatherTask;
  }

  return {
    refresh,
    current: () => weather,
    async invalidate() {
      revision++;
      weather = null;
      onUpdate(null);
      await weatherTask;
      return refresh();
    },
  };
}
