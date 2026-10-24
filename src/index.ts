import { createClient } from './client.js';
import { parseEnv } from './config/env.js';

const env = parseEnv(process.env);
const client = createClient(env);

const shutdown = async (signal: string) => {
  client.logger.info(`Received ${signal}, shutting down`);
  await client.destroy();
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  await client.login(env.DISCORD_TOKEN);
} catch (error) {
  client.logger.fatal(error);
  await client.destroy();
  process.exit(1);
}
