import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';
import { type BetterSQLite3Database, drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import * as schema from './schema.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];
export type DbOrTx = Db | Tx;

// Resolves to the repo's drizzle/ folder from both src/db (tsx) and dist/db (compiled).
const migrationsFolder = fileURLToPath(new URL('../../drizzle', import.meta.url));

/** Opens the database (creating its directory), applies pending migrations and returns it. */
export function openDatabase(path: string): Db {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const client = new Database(path);
  client.pragma('journal_mode = WAL');
  client.pragma('foreign_keys = ON');
  client.pragma('busy_timeout = 5000');
  const db = drizzle({ client, schema });
  migrate(db, { migrationsFolder });
  return db;
}

export function closeDatabase(db: Db): void {
  db.$client.close();
}

declare module '@sapphire/pieces' {
  interface Container {
    db: Db;
  }
}
