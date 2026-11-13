import dotenv from 'dotenv';
import { join } from 'node:path';
import { PROJECT_ROOT } from './config/paths.js';
import { createApplication } from './app.js';
import { networkInterfaces } from 'node:os';
dotenv.config({ path: join(PROJECT_ROOT, '.env') });
const port = Number(process.env.PORT || 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error('PORT must be an integer between 1 and 65535.');
const application = await createApplication({
  apiKey: process.env.GEMINI_API_KEY,
  model: process.env.GEMINI_MODEL,
});
application.server.on('error', (error) => {
  console.error(
    error.code === 'EADDRINUSE'
      ? 'Port ' + port + ' is already in use. Stop the other instance or change PORT.'
      : 'Could not start server: ' + error.message,
  );
  process.exitCode = 1;
  void application.close();
});
application.server.listen(port, () => {
  console.log('FLOOD Lifting House dashboard: http://localhost:' + port);
  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses || []) {
      if (address.family === 'IPv4' && !address.internal)
        console.log(`ESP32 SERVER_URL: http://${address.address}:${port}/api/esp`);
    }
  }
});
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const timeout = setTimeout(() => process.exit(1), 5000);
  timeout.unref();
  await application.close();
  clearTimeout(timeout);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
