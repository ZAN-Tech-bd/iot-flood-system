import { $, setText, number, time } from '../lib/dom.js';

export function initTelemetry(socket) {
  let config, telemetry;
  socket.on('configUpdate', (data) => {
    config = data;
  });
  function connection(connected) {
    setText('connection', connected ? '● Server connected' : '● Server offline');
    $('connection').classList.toggle('offline', !connected);
    updateFreshness();
  }
  socket.on('connect', () => connection(true));
  socket.on('disconnect', () => connection(false));

  function updateFreshness() {
    const age = telemetry?.updatedAt ? Date.now() - Date.parse(telemetry.updatedAt) : Infinity;
    const fresh = socket.connected && age < 30000;
    const running = fresh && telemetry.motorActive === true;
    const lifting = running && telemetry.motorDirection === 'up';
    const lowering = running && telemetry.motorDirection === 'down';
    setText(
      'liftStatus',
      !fresh
        ? 'Lift status unavailable'
        : lifting
          ? 'House is lifting'
          : lowering
            ? 'House is lowering'
            : running
              ? 'Lift motor running'
              : 'House is stationary',
    );
    setText(
      'liftDetail',
      !fresh
        ? 'Waiting for fresh controller data.'
        : lifting
          ? 'Lift motor running · elevation updates from the ultrasonic sensor.'
          : lowering
            ? 'Lift motor lowering · elevation updates from the ultrasonic sensor.'
            : running
              ? 'Motor running · waiting for controller direction feedback.'
              : 'Lift motor stopped · holding current position.',
    );
    $('liftStatusPanel').classList.toggle('lifting', lifting);
    $('house').classList.toggle('lifting', lifting);
    $('liftStatusPanel').classList.toggle('lowering', lowering);
    $('house').classList.toggle('lowering', lowering);
    $('liftArrows').hidden = !lifting && !lowering;
    setText('liftArrows', lowering ? '↓ ↓ ↓' : '↑ ↑ ↑');
    setText(
      'sensorBadge',
      fresh ? '● Sensor online' : telemetry?.updatedAt ? '● Sensor stale' : 'No sensor data',
    );
    $('sensorBadge').classList.toggle('offline', !fresh);
    $('sensorNotice').classList.toggle('good', fresh);
    setText(
      'sensorNotice',
      fresh
        ? telemetry.distanceCm === null
          ? 'Water sensor connected. Waiting for an ultrasonic distance reading.'
          : 'Live telemetry connected. House elevation is measured relative to your calibrated ground position.'
        : telemetry?.updatedAt
          ? 'Sensor data is stale. Values below are the last received measurements.'
          : 'Waiting for the controller. Measurements will appear when the sensors connect.',
    );
  }
  socket.on('dashboardUpdate', (data) => {
    telemetry = data;
    setText('height', number(data.houseHeightCm, 'cm'));
    setText('water', number(data.sensorLevel, '%'));
    setText('distance', number(data.distanceCm, 'cm'));
    setText(
      'sceneHeight',
      data.houseHeightCm === null
        ? 'Waiting for sensor'
        : `↥ ${number(data.houseHeightCm, 'cm')} elevation`,
    );
    setText(
      'lastReading',
      data.updatedAt
        ? `Last sensor reading · ${time(data.updatedAt)}`
        : 'No sensor readings received',
    );
    setText(
      'waterHint',
      data.sensorLevel === null
        ? 'Waiting for water sensor'
        : data.sensorLevel >= config?.startLevel
          ? 'Above configured lift threshold'
          : 'Below configured lift threshold',
    );
    $('waterBar').style.width = `${data.sensorLevel ?? 0}%`;
    $('sceneWater').style.height = `${15 + (data.sensorLevel ?? 0) * 0.65}px`;
    $('house').style.transform =
      `translateY(-${Math.min(45, ((data.houseHeightCm ?? 0) / (config?.maxHeightCm || 300)) * 45)}px)`;
    updateFreshness();
  });
  setInterval(updateFreshness, 3000);
}
