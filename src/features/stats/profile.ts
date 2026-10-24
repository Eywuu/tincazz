import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { playerStats } from '../../db/schema.js';
import { coinsRank, findWallet, utcDay } from '../economy/index.js';

export interface PlayerProfile {
  balance: number;
  rank: number;
  dailyStreak: number;
  spins: number;
  wins: number;
  jackpots: number;
  wagered: number;
  won: number;
  biggestWin: number;
  bestOdds: number;
}

/** Undefined without a wallet. A missing `player_stats` row reads as zeros. */
export function playerProfile(
  db: DbOrTx,
  guildId: string,
  userId: string,
  now: number,
): PlayerProfile | undefined {
  const wallet = findWallet(db, guildId, userId);
  const rank = coinsRank(db, guildId, userId);
  if (!wallet || rank === undefined) {
    return undefined;
  }
  const stats = db
    .select()
    .from(playerStats)
    .where(and(eq(playerStats.guildId, guildId), eq(playerStats.userId, userId)))
    .get();
  const streakAlive = wallet.lastDailyAt !== null && utcDay(now) - utcDay(wallet.lastDailyAt) <= 1;
  return {
    balance: wallet.balance,
    rank,
    dailyStreak: streakAlive ? wallet.dailyStreak : 0,
    spins: stats?.spins ?? 0,
    wins: stats?.wins ?? 0,
    jackpots: stats?.jackpots ?? 0,
    wagered: stats?.wagered ?? 0,
    won: stats?.won ?? 0,
    biggestWin: stats?.biggestWin ?? 0,
    bestOdds: stats?.bestOdds ?? 0,
  };
}
