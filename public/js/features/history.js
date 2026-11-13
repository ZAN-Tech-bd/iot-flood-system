import { $, number } from '../lib/dom.js';

export function initHistory() {
  let nextCursor = null,
    cursor = null,
    previous = [],
    requestVersion = 0,
    activeFilters = '';
  const formatDate = (value) => (value ? new Date(value).toLocaleString() : 'Unavailable');
  function localInput(date) {
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  }
  function today() {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setHours(23, 59, 59, 0);
    $('historyFrom').value = localInput(start);
    $('historyTo').value = localInput(end);
  }
  function controls(busy) {
    $('historyApply').disabled = busy;
    $('historyOlder').disabled = busy || nextCursor === null;
    $('historyNewer').disabled = busy || previous.length === 0;
  }
  function render(items) {
    const fragment = document.createDocumentFragment();
    for (const item of items) {
      const row = document.createElement('tr'),
        sensor = item.sensors,
        weather = item.weather;
      const values = [
        formatDate(item.recordedAt),
        `${item.location.city}, ${item.location.country}`,
        number(sensor.sensorLevel, '%'),
        number(sensor.houseHeightCm, 'cm'),
        number(sensor.distanceCm, 'cm'),
        sensor.motorActive
          ? `Running${sensor.motorDirection ? ' (' + sensor.motorDirection + ')' : ''}`
          : 'Stopped',
        number(weather?.current?.temperature_2m, '°C'),
        number(weather?.current?.precipitation, 'mm'),
        number(weather?.current?.wind_speed_10m, 'km/h'),
        number(weather?.current?.relative_humidity_2m, '%'),
        number(weather?.riverDischarge, 'm³/s'),
        `${item.weatherStatus} · fetched ${formatDate(weather?.fetchedAt)}${item.weatherAgeSeconds === null ? '' : ` · ${item.weatherAgeSeconds}s old`}${weather?.current?.time ? ` · observation ${weather.current.time.replace('T', ' ')} (location time)` : ''}`,
      ];
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      fragment.append(row);
    }
    $('historyRows').replaceChildren(fragment);
  }
  async function load(reset = true, targetCursor = null, targetPrevious = []) {
    const version = ++requestVersion;
    let filters = activeFilters;
    if (reset) {
      const params = new URLSearchParams();
      for (const [id, key] of [
        ['historyFrom', 'from'],
        ['historyTo', 'to'],
      ]) {
        if ($(id).value) {
          const date = new Date($(id).value);
          if (!Number.isFinite(date.getTime())) {
            $('historyStatus').textContent = 'Choose valid dates and times.';
            controls(false);
            return;
          }
          if (key === 'to') date.setMilliseconds(999);
          params.set(key, date.toISOString());
        }
      }
      filters = params.toString();
    }
    controls(true);
    $('historyStatus').textContent = 'Loading saved readings…';
    try {
      const params = new URLSearchParams(filters);
      params.set('limit', '50');
      if (targetCursor !== null) params.set('before', String(targetCursor));
      const response = await fetch(`/api/history?${params}`);
      const data = await response.json();
      if (version !== requestVersion) return;
      if (!response.ok) throw new Error(data.error || 'Unable to load history.');
      activeFilters = filters;
      cursor = targetCursor;
      previous = targetPrevious;
      nextCursor = data.nextCursor;
      render(data.items);
      $('historyStatus').textContent = data.items.length
        ? `${data.items.length} saved readings · page ${previous.length + 1} · newest received first. Refresh to include new readings.`
        : 'No readings in this date range. Logs begin when the controller sends data.';
    } catch (error) {
      if (version === requestVersion) $('historyStatus').textContent = error.message;
    } finally {
      if (version === requestVersion) controls(false);
    }
  }
  $('historyZone').textContent =
    `Dates and times use your browser timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}.`;
  today();
  controls(false);
  $('historyFilters').addEventListener('submit', (event) => {
    event.preventDefault();
    void load();
  });
  $('historyToday').addEventListener('click', () => {
    today();
    void load();
  });
  $('historyAll').addEventListener('click', () => {
    $('historyFrom').value = '';
    $('historyTo').value = '';
    void load();
  });
  $('historyOlder').addEventListener('click', () => {
    if (nextCursor !== null) void load(false, nextCursor, [...previous, cursor]);
  });
  $('historyNewer').addEventListener('click', () => {
    if (previous.length) void load(false, previous.at(-1), previous.slice(0, -1));
  });
  window.addEventListener('hashchange', () => {
    if (location.hash === '#history') void load();
  });
  if (location.hash === '#history') void load();
}
