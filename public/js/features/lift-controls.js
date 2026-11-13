import { $, setText } from '../lib/dom.js';

export function initLiftControls(socket) {
  let savedMode = 'auto';
  let telemetry,
    command = null,
    pending = false,
    requestVersion = 0;
  function render() {
    setText(
      'modeLabel',
      command?.action
        ? 'Dashboard manual override'
        : savedMode === 'manual'
          ? 'Manual override'
          : 'Automatic operation',
    );
    const fresh =
      socket.connected &&
      telemetry?.updatedAt &&
      Date.now() - Date.parse(telemetry.updatedAt) < 30000;
    $('liftUp').disabled = !fresh || pending || telemetry?.upperLimit === true;
    $('liftDown').disabled = !fresh || pending || telemetry?.lowerLimit === true;
    // Stop stays available while a movement request is pending or sensor data is stale.
    $('liftStop').disabled = !socket.connected;
    for (const action of ['up', 'down', 'stop'])
      $('lift' + action[0].toUpperCase() + action.slice(1)).setAttribute(
        'aria-pressed',
        String(command?.action === action),
      );
    const seconds = command?.expiresAt
      ? Math.max(0, Math.ceil((Date.parse(command.expiresAt) - Date.now()) / 1000))
      : 0;
    const stopped = fresh && telemetry.motorActive === false;
    const limitMessage =
      fresh && telemetry.upperLimit && telemetry.lowerLimit
        ? 'Both travel limits active'
        : fresh && telemetry.upperLimit
          ? 'Upper limit reached'
          : fresh && telemetry.lowerLimit
            ? 'Lower limit reached'
            : null;
    setText(
      'liftCommandState',
      !socket.connected
        ? 'Server offline · commands unavailable'
        : limitMessage && stopped
          ? `${limitMessage} · lifting stopped`
          : !fresh
            ? 'Waiting for fresh controller data'
            : telemetry.motorActive && telemetry.motorDirection === 'up'
              ? 'Lifting up · will stop at the upper limit or safety timeout'
              : telemetry.motorActive && telemetry.motorDirection === 'down'
                ? 'Moving down · will stop at the lower limit or safety timeout'
                : !command?.action
                  ? 'No dashboard override'
                  : command.action === 'stop'
                    ? stopped && Date.parse(telemetry.updatedAt) >= Date.parse(command.requestedAt)
                      ? 'Lifting stopped'
                      : 'Requested: Stop · awaiting controller feedback'
                    : seconds === 0
                      ? 'Movement window ended · waiting for server stop'
                      : `Requested: ${command.action === 'up' ? 'Up' : 'Down'} · ${seconds}s remaining`,
    );
  }
  socket.on('dashboardUpdate', (data) => {
    telemetry = data;
    render();
  });
  socket.on('configUpdate', (data) => {
    savedMode = data.mode;
    render();
  });
  socket.on('liftCommandUpdate', (data) => {
    command = data;
    render();
  });
  socket.on('connect', render);
  socket.on('disconnect', () => {
    requestVersion++;
    pending = false;
    setText('liftControlMessage', 'Connection lost. A browser cannot confirm a hardware stop.');
    render();
  });
  for (const [id, action] of [
    ['liftUp', 'up'],
    ['liftDown', 'down'],
    ['liftStop', 'stop'],
  ]) {
    $(id).addEventListener('click', () => {
      if (!socket.connected) return;
      const version = ++requestVersion;
      pending = action !== 'stop';
      render();
      setText('liftControlMessage', `Sending ${action} command…`);
      socket.timeout(5000).emit('liftCommand', { action }, (error, result) => {
        if (version !== requestVersion) return;
        pending = false;
        if (!error && result?.ok) command = result.command;
        setText(
          'liftControlMessage',
          error
            ? 'Command not confirmed. Check the connection; use Stop to request a halt.'
            : result?.error ||
                (action === 'stop'
                  ? 'Stop requested. Waiting for the controller to confirm.'
                  : `${action === 'up' ? 'Up' : 'Down'} requested. Movement stops at the ${action === 'up' ? 'upper' : 'lower'} limit or after 15 seconds.`),
        );
        render();
      });
    });
  }
  render();
  setInterval(render, 1000);
}
