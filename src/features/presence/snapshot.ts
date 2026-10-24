import { and, count, eq, gte } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { pots, spins } from '../../db/schema.js';
import { pot } from '../gamba/config.js';

const dayMs = 86_400_000;

export interface PotRow {
  pot: number;
  lastWinnerId?: string;
  lastWonAt?: number;
  spinsToday: number;
}

/** Reads what the status needs for one guild. Spins are counted since 00:00 UTC. */
export function readPotRow(db: Db, guildId: string, now: number): PotRow {
  const row = db.select().from(pots).where(eq(pots.guildId, guildId)).get();
  const startOfDay = Math.floor(now / dayMs) * dayMs;
  const today = db
    .select({ total: count() })
    .from(spins)
    .where(and(eq(spins.guildId, guildId), gte(spins.createdAt, startOfDay)))
    .get();
  return {
    pot: row?.amount ?? pot.seed,
    lastWinnerId: row?.lastWinnerId ?? undefined,
    lastWonAt: row?.lastWonAt ?? undefined,
    spinsToday: today?.total ?? 0,
  };
}
