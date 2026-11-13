const socket = io();

socket.on('dashboardUpdate', (data) => {
  document.getElementById('waterLevel').innerText = data.sensorLevel + '%';
  document.getElementById('motorStatus').innerText = data.motorActive ? 'Running' : 'Stopped';
});

socket.on('configUpdate', (config) => {
  document.getElementById('cityInput').value = config.city;
  document.getElementById('countryInput').value = config.country;
  document.getElementById('startLevel').value = config.startLevel;
  document.getElementById('stopLevel').value = config.stopLevel;
  document.getElementById('modeSelect').value = config.mode;
  document.getElementById('manualStateSelect').value = config.manualState.toString();
});

socket.on('analysisResult', (data) => {
  const box = document.getElementById('aiOutput');
  box.style.display = 'block';
  let content = `<strong>AI Assessment:</strong> ${data.text}`;
  if (data.env) {
    content += `<br><br><small>Temp: ${data.env.temperature}°C | Wind: ${data.env.windspeed} km/h | Discharge: ${data.env.riverDischarge} m³/s</small>`;
  }
  box.innerHTML = content;
});

function updateConfig() {
  socket.emit('updateConfig', {
    city: document.getElementById('cityInput').value,
    country: document.getElementById('countryInput').value,
    startLevel: parseInt(document.getElementById('startLevel').value, 10),
    stopLevel: parseInt(document.getElementById('stopLevel').value, 10),
    mode: document.getElementById('modeSelect').value,
    manualState: document.getElementById('manualStateSelect').value === 'true'
  });
}

function requestAnalysis() {
  const box = document.getElementById('aiOutput');
  box.style.display = 'block';
  box.innerHTML = 'Querying environmental data and Gemini model...';
  socket.emit('requestAnalysis');
}