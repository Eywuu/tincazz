import { container } from '@sapphire/framework';
import { createClient } from './client.js';
import { parseEnv } from './config/env.js';
import { closeDatabase, type Db, openDatabase } from './db/index.js';

const env = parseEnv(process.env);
const client = createClient(env);
let db: Db | undefined;

const shutdown = async (signal: string) => {
  client.logger.info(`Received ${signal}, shutting down`);
  await client.destroy();
  if (db) closeDatabase(db);
  process.exit(0);
};
process.once('SIGINT', () => void shutdown('SIGINT'));
process.once('SIGTERM', () => void shutdown('SIGTERM'));

try {
  db = openDatabase(env.DATABASE_PATH);
  container.db = db;
  client.logger.info(`Database ready at ${env.DATABASE_PATH}`);
  await client.login(env.DISCORD_TOKEN);
} catch (error) {
  client.logger.fatal(error);
  await client.destroy();
  if (db) closeDatabase(db);
  process.exit(1);
}
