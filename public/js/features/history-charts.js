const metrics = [
  ['Water level', '%', '#287db5', (item) => item.sensors.sensorLevel],
  ['House elevation', 'cm', '#16816b', (item) => item.sensors.houseHeightCm],
  ['Ultrasonic distance', 'cm', '#7260b4', (item) => item.sensors.distanceCm],
  ['Temperature', '°C', '#c56a32', (item) => item.weather?.current?.temperature_2m],
  ['Rainfall', 'mm', '#287db5', (item) => item.weather?.current?.precipitation],
  ['Wind speed', 'km/h', '#16816b', (item) => item.weather?.current?.wind_speed_10m],
  ['Humidity', '%', '#7260b4', (item) => item.weather?.current?.relative_humidity_2m],
  ['River discharge (modeled)', 'm³/s', '#287db5', (item) => item.weather?.riverDischarge],
];

export function renderHistoryCharts(container, items) {
  const ordered = [...items].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  const fragment = document.createDocumentFragment();
  for (const [name, unit, color, read] of metrics) {
    const card = document.createElement('section');
    card.className = 'history-chart';
    const heading = document.createElement('h3');
    heading.textContent = `${name} · ${unit}`;
    card.append(heading);
    const values = ordered.map(read);
    const valid = values.filter((value) => typeof value === 'number' && Number.isFinite(value));
    if (!valid.length) {
      const empty = document.createElement('p');
      empty.className = 'fine history-chart-empty';
      empty.textContent = 'No measurements available on this page.';
      card.append(empty);
    } else {
      const low = Math.min(...valid),
        high = Math.max(...valid);
      const padding = (high - low) * 0.12 || Math.max(Math.abs(high) * 0.05, 1);
      const min = low - padding,
        max = high + padding;
      const start = new Date(ordered[0].recordedAt).getTime();
      const end = new Date(ordered.at(-1).recordedAt).getTime();
      const x = (item) =>
        end === start
          ? 228
          : 56 + ((new Date(item.recordedAt).getTime() - start) / (end - start)) * 344;
      const y = (value) => 158 - ((value - min) / (max - min)) * 130;
      const chart = document.createElement('div');
      // SVG markup contains only numeric coordinates and fixed metric labels.
      let svg = `<svg viewBox="0 0 420 200" role="img" aria-label="${name} over time in ${unit}">`;
      for (let tick = 0; tick <= 2; tick++) {
        const value = min + ((max - min) * tick) / 2;
        svg += `<line x1="56" x2="400" y1="${y(value)}" y2="${y(value)}" class="chart-grid"/><text x="48" y="${y(value) + 4}" text-anchor="end">${Number(value.toFixed(1))}</text>`;
      }
      let segment = [];
      const flush = () => {
        if (segment.length)
          svg += `<polyline points="${segment.join(' ')}" fill="none" stroke="${color}" stroke-width="2.5"/>`;
        segment = [];
      };
      ordered.forEach((item, index) => {
        const value = values[index];
        if (typeof value !== 'number' || !Number.isFinite(value)) {
          flush();
          return;
        }
        segment.push(`${x(item)},${y(value)}`);
      });
      flush();
      ordered.forEach((item, index) => {
        const value = values[index];
        if (typeof value !== 'number' || !Number.isFinite(value)) return;
        const date = new Date(item.recordedAt).toLocaleString();
        svg += `<circle cx="${x(item)}" cy="${y(value)}" r="4" fill="${color}" tabindex="0"><title>${Number(value.toFixed(2))} ${unit} · ${date.replaceAll('&', '&amp;').replaceAll('<', '&lt;')}</title></circle>`;
      });
      svg += '</svg>';
      chart.innerHTML = svg;
      card.append(chart);
      const times = document.createElement('p');
      times.className = 'history-chart-times fine';
      times.textContent = `${new Date(start).toLocaleString()} → ${new Date(end).toLocaleString()}`;
      card.append(times);
    }
    fragment.append(card);
  }
  container.replaceChildren(fragment);
}
