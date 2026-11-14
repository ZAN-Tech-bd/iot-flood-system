export function createLiftControl({ isFresh, onChange, now = Date.now }) {
  let command = { action: null, requestedAt: null, expiresAt: null };
  let waterDetected = null;
  function publish(action) {
    command = { action, requestedAt: new Date(now()).toISOString(), expiresAt: null };
    onChange({ ...command });
    return { ...command };
  }
  function current() {
    return { ...command };
  }
  return {
    current,
    observeLevel(level) {
      const detected = level > 0;
      // A manual stop holds until wet/dry state changes, not just the next poll.
      if (waterDetected !== null && detected !== waterDetected && command.action === 'stop')
        publish(null);
      waterDetected = detected;
    },
    request(action) {
      if (!['up', 'down', 'stop'].includes(action)) throw new Error('Choose Up, Down, or Stop.');
      if (action !== 'stop' && !isFresh())
        throw new Error('Wait for fresh controller readings before moving the lift.');
      const active = current().action;
      if (action !== 'stop' && active === action) return publish('stop');
      if (action !== 'stop' && active && active !== 'stop' && active !== action)
        throw new Error('Press Stop before changing direction.');
      return publish(action);
    },
    controllerConfig(config) {
      const { action } = current();
      return {
        ...config,
        ...(action === null ? {} : { mode: 'manual', manualState: action === 'up' }),
        liftCommand:
          action ?? (config.mode === 'manual' ? (config.manualState ? 'up' : 'stop') : 'auto'),
        commandExpiresAt: null,
        commandId: command.requestedAt,
        commandRemainingMs: null,
      };
    },
  };
}
