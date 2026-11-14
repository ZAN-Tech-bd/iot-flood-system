import { $, setText } from '../lib/dom.js';

export function initSettings(socket, picker) {
  let config;
  socket.on('configUpdate', (data) => {
    config = data;
    setText('location', `${data.city}, ${data.country}`);
    picker.setLocation({
      city: data.city,
      country: data.country,
      countryCode: data.countryCode,
      lat: data.lat,
      lon: data.lon,
    });
    setText(
      'keyStatus',
      data.apiKeyConfigured
        ? '● Key configured on the server. Leave blank to keep it.'
        : 'No key configured. Add one to enable feedback.',
    );
  });

  $('settingsForm').addEventListener('submit', (event) => {
    event.preventDefault();
    const selectedLocation = picker.getSelection();
    if (!selectedLocation || selectedLocation.countryCode !== $('country').value)
      return setText('saveStatus', 'Search and select a city first.');
    const next = {
      ...config,
      ...selectedLocation,
      apiKey: $('apiKey').value.trim(),
    };
    $('saveSettings').disabled = true;
    setText('saveStatus', 'Saving configuration…');
    socket.timeout(30000).emit('updateConfig', next, (error, result) => {
      $('saveSettings').disabled = false;
      setText(
        'saveStatus',
        error
          ? 'Save not confirmed. Check the connection and retry.'
          : result.error || 'Configuration saved successfully.',
      );
      if (!error && result.ok) $('apiKey').value = '';
    });
  });
}
