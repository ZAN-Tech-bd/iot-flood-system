export const MOVE_DURATION_MS = 15_000;

export function createLiftControl({ isFresh, onChange, now = Date.now }) {
  let command = { action: null, requestedAt: null, expiresAt: null };
  function publish(action) {
    const timestamp = now();
    command = {
      action,
      requestedAt: new Date(timestamp).toISOString(),
      expiresAt:
        action === 'up' || action === 'down'
          ? new Date(timestamp + MOVE_DURATION_MS).toISOString()
          : null,
    };
    onChange({ ...command });
    return { ...command };
  }
  function current() {
    if (command.expiresAt && now() >= Date.parse(command.expiresAt)) publish('stop');
    return { ...command };
  }
  return {
    current,
    request(action) {
      if (!['up', 'down', 'stop'].includes(action)) throw new Error('Choose Up, Down, or Stop.');
      if (action !== 'stop' && !isFresh())
        throw new Error('Wait for fresh controller readings before moving the lift.');
      const active = current().action;
      if (action !== 'stop' && active && active !== 'stop' && active !== action)
        throw new Error('Press Stop before changing direction.');
      return publish(action);
    },
    controllerConfig(config) {
      const { action, expiresAt } = current();
      return {
        ...config,
        ...(action === null ? {} : { mode: 'manual', manualState: action === 'up' }),
        liftCommand:
          action ?? (config.mode === 'manual' ? (config.manualState ? 'up' : 'stop') : 'auto'),
        commandExpiresAt: expiresAt,
      };
    },
  };
}
