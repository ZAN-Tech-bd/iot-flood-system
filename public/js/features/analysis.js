import { $, setText, time } from '../lib/dom.js';

export function initAnalysis(socket) {
  let analysisTimer;
  socket.on('disconnect', () => {
    clearTimeout(analysisTimer);
    $('analyze').disabled = false;
    if (!$('aiOutput').hidden)
      setText('aiOutput', 'Connection interrupted. Reconnect and generate feedback again.');
  });
  $('analyze').addEventListener('click', () => {
    if (!socket.connected) return;
    $('analyze').disabled = true;
    $('aiOutput').hidden = false;
    $('aiOutput').classList.remove('error');
    setText(
      'aiOutput',
      'Combining fresh sensor readings with local weather. Asking Gemini for feedback…',
    );
    socket.emit('requestAnalysis');
    analysisTimer = setTimeout(() => {
      $('analyze').disabled = false;
      setText('aiOutput', 'The request timed out. Check your connection and retry.');
    }, 60000);
  });
  socket.on('analysisResult', (data) => {
    clearTimeout(analysisTimer);
    $('analyze').disabled = false;
    $('aiOutput').hidden = false;
    $('aiOutput').classList.toggle('error', Boolean(data.error));
    setText('aiOutput', data.error || data.text);
    setText(
      'analysisTime',
      data.error
        ? 'Review Settings or reconnect your sensors, then retry.'
        : `Generated ${time(data.generatedAt)} · sensors ${time(data.sensorAt)} · weather fetched ${time(data.weatherAt)} · advisory only`,
    );
  });
}
