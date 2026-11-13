import { fileURLToPath } from 'node:url';
export const PROJECT_ROOT = fileURLToPath(new URL('../../', import.meta.url));
export const PUBLIC_DIRECTORY = fileURLToPath(new URL('../../public/', import.meta.url));
export const CONFIG_FILE = fileURLToPath(new URL('../../data/config.json', import.meta.url));
export const HISTORY_FILE = fileURLToPath(new URL('../../data/history.sqlite', import.meta.url));
