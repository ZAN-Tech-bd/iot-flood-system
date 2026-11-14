import { $, setText } from '../lib/dom.js';

// Optional browser controls. Automatic motion remains local to the ESP32.
export function initLiftControls(socket) {
  let telemetry,
    pending = false;
  function render() {
    const fresh =
      socket.connected &&
      telemetry?.updatedAt &&
      Date.now() - Date.parse(telemetry.updatedAt) < 30000;
    setText('modeLabel', 'ESP32 local control · dashboard is monitoring only');
    let message = 'Waiting for device readings. Local control continues without this dashboard.';
    if (fresh) {
      if (telemetry.motorActive)
        message =
          telemetry.motorDirection === 'up'
            ? 'House is lifting up'
            : telemetry.motorDirection === 'down'
              ? 'House is moving down'
              : 'Motor is running';
      else if (telemetry.upperLimit && telemetry.lowerLimit)
        message = 'Both travel limits active · lifting stopped';
      else if (telemetry.upperLimit) message = 'Upper limit reached · lifting stopped';
      else if (telemetry.lowerLimit) message = 'Lower limit reached · lifting stopped';
      else message = 'Lifting stopped';
    }
    setText('liftCommandState', message);
  }
  socket.on('dashboardUpdate', (data) => {
    telemetry = data;
    render();
  });
  socket.on('connect', render);
  socket.on('disconnect', render);
  for (const [id, direction] of [
    ['liftUp', 'up'],
    ['liftDown', 'down'],
    ['liftStop', 'stop'],
  ]) {
    $(id).addEventListener('click', () => {
      if (!socket.connected) return;
      const action =
        direction !== 'stop' && telemetry?.motorActive && telemetry.motorDirection === direction
          ? 'stop'
          : direction;
      pending = action !== 'stop';
      render();
      socket.timeout(5000).emit('liftCommand', { action }, (error, result) => {
        pending = false;
        render();
        setText(
          'liftControlMessage',
          error
            ? 'Command not confirmed; local sensor control continues.'
            : result?.error ||
                'Command accepted. The ESP32 applies it on its next poll; sensor changes restore automatic control.',
        );
      });
    });
  }
  render();
  setInterval(render, 1000);
}
