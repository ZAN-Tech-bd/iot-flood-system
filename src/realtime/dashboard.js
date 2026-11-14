export function registerDashboard(
  io,
  { config, telemetry, weather, generateFeedback, model, lift },
) {
  io.on('connection', (socket) => {
    socket.emit('configUpdate', config.publicConfig());
    socket.emit('dashboardUpdate', telemetry.snapshot());
    socket.emit('liftCommandUpdate', lift.current());
    socket.on('liftCommand', (input, reply) => {
      try {
        const command = lift.request(input?.action);
        if (typeof reply === 'function') reply({ ok: true, command });
      } catch (error) {
        if (typeof reply === 'function') reply({ error: error.message });
      }
    });
    if (weather.current()) socket.emit('weatherUpdate', weather.current());
    else void weather.refresh();
    socket.on('refreshWeather', async (_, reply) => {
      await weather.refresh();
      if (typeof reply === 'function') reply({ ok: true });
    });
    socket.on('updateConfig', async (input, reply) => {
      try {
        const { locationChanged } = await config.save(input);
        io.emit('configUpdate', config.publicConfig());
        io.emit('dashboardUpdate', telemetry.snapshot());
        if (locationChanged) void weather.invalidate();
        if (typeof reply === 'function') reply({ ok: true });
      } catch (error) {
        if (typeof reply === 'function') reply({ error: error.message });
      }
    });
    let analyzing = false;
    socket.on('requestAnalysis', async () => {
      if (analyzing) return;
      analyzing = true;
      try {
        if (!config.getApiKey()) throw new Error('Add a Gemini API key in Settings first.');
        if (!telemetry.isFresh())
          throw new Error('Connect the controller and wait for fresh sensor data first.');
        const env = await weather.refresh();
        if (!env?.current) throw new Error('Live weather unavailable. Refresh and retry.');
        if (!telemetry.isFresh())
          throw new Error('Sensor data became stale. Reconnect the controller.');
        socket.emit(
          'analysisResult',
          await generateFeedback({
            apiKey: config.getApiKey(),
            model,
            sensors: telemetry.snapshot(),
            weather: env,
            config: config.get(),
          }),
        );
      } catch (error) {
        socket.emit('analysisResult', { error: error.message });
      } finally {
        analyzing = false;
      }
    });
  });
}
