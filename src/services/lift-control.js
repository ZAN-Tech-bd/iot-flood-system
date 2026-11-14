import { randomUUID } from 'node:crypto';
// Optional browser overrides; firmware remains the authority for local motion.
export function createLiftControl({ isFresh, onChange }) {
  let command = { action: null, id: null };
  return {
    current: () => ({ ...command }),
    request(action) {
      if (!['up', 'down', 'stop'].includes(action)) throw new Error('Choose Up, Down, or Stop.');
      if (action !== 'stop' && !isFresh()) throw new Error('Wait for fresh controller readings.');
      command = { action, id: randomUUID() };
      onChange({ ...command });
      return { ...command };
    },
  };
}
