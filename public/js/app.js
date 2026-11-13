import { initLiftControls } from './features/lift-controls.js';
import { initHistory } from './features/history.js';
import { initNavigation } from './features/navigation.js';
import { initLocationPicker } from './features/location-picker.js';
import { initSettings } from './features/settings.js';
import { initTelemetry } from './features/telemetry.js';
import { initWeather } from './features/weather.js';
import { initAnalysis } from './features/analysis.js';
const socket = window.io();
initNavigation();
const locationPicker = initLocationPicker();
initSettings(socket, locationPicker);
initTelemetry(socket);
initWeather(socket);
initAnalysis(socket);

initHistory();

initLiftControls(socket);
