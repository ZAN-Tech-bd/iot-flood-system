import { $, setText, number, time } from '../lib/dom.js';

export function initWeather(socket) {
  function describe(code) {
    if (!Number.isFinite(code)) return 'Conditions unavailable';
    if (code === 0) return 'Clear sky';
    if (code <= 3) return 'Partly cloudy';
    if (code <= 48) return 'Foggy conditions';
    if (code <= 67) return 'Rain / drizzle';
    if (code <= 77) return 'Snow conditions';
    if (code <= 86) return 'Showers';
    return 'Thunderstorm conditions';
  }
  socket.on('weatherUpdate', (data) => {
    const current = data?.current;
    setText('temperature', number(current?.temperature_2m, '°C'));
    setText('rain', number(current?.precipitation, 'mm'));
    setText('wind', number(current?.wind_speed_10m, 'km/h'));
    setText('humidity', number(current?.relative_humidity_2m, '%'));
    setText('river', number(data?.riverDischarge, 'm³/s'));
    setText(
      'weatherDescription',
      data ? data.error || describe(current?.weather_code) : 'Fetching local weather…',
    );
    setText(
      'weatherTime',
      data
        ? `Fetched ${time(data.fetchedAt)} · observation ${current?.time?.replace('T', ' ') || 'unavailable'} (local)`
        : 'Open-Meteo · refreshes every 10 minutes',
    );
  });
  $('refreshWeather').addEventListener('click', () => {
    $('refreshWeather').disabled = true;
    socket.timeout(20000).emit('refreshWeather', {}, () => {
      $('refreshWeather').disabled = false;
    });
  });
}
