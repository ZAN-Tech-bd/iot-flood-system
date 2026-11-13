import { readFile, mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG } from '../config/defaults.js';
import { CONFIG_FILE } from '../config/paths.js';
import { validateConfig } from '../domain/validation.js';
export async function createConfigStore({ file = CONFIG_FILE, apiKey = '' } = {}) {
  let config = { ...DEFAULT_CONFIG };
  try {
    config = validateConfig({ ...DEFAULT_CONFIG, ...JSON.parse(await readFile(file, 'utf8')) });
  } catch (error) {
    if (error.code !== 'ENOENT')
      console.error('Saved settings invalid or unreadable; using defaults.');
  }
  let saving = false;
  return {
    get: () => ({ ...config }),
    getApiKey: () => apiKey,
    publicConfig: () => ({ ...config, apiKeyConfigured: Boolean(apiKey) }),
    async save(input) {
      if (saving) throw new Error('Another update is in progress. Retry shortly.');
      saving = true;
      try {
        const next = validateConfig(input);
        await mkdir(dirname(file), { recursive: true });
        // Rename a complete temporary file so an interrupted write cannot truncate saved settings.
        await writeFile(file + '.tmp', JSON.stringify(next, null, 2));
        await rename(file + '.tmp', file);
        const changed = config.lat !== next.lat || config.lon !== next.lon;
        config = next;
        if (input.apiKey?.trim()) apiKey = input.apiKey.trim();
        return { locationChanged: changed };
      } catch (error) {
        if (error.code) throw new Error('Could not save settings to disk.');
        throw error;
      } finally {
        saving = false;
      }
    },
  };
}
