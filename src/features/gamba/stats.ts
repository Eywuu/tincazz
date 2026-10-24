import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { playerStats } from '../../db/schema.js';
import type { Evaluation } from './evaluate.js';

/** Counts a free spin in `player_stats`; wager columns are left alone. */
export function recordFreeSpinStats(
  tx: DbOrTx,
  guildId: string,
  userId: string,
  evaluation: Evaluation,
): void {
  const win = evaluation.freePrize > 0 ? 1 : 0;
  const jackpot = evaluation.result === 'jackpot' ? 1 : 0;
  const odds = evaluation.odds ?? 0;
  tx.insert(playerStats)
    .values({
      guildId,
      userId,
      spins: 1,
      wins: win,
      jackpots: jackpot,
      biggestWin: evaluation.freePrize,
      bestOdds: odds,
    })
    .onConflictDoUpdate({
      target: [playerStats.guildId, playerStats.userId],
      set: {
        spins: sql`${playerStats.spins} + 1`,
        wins: sql`${playerStats.wins} + ${win}`,
        jackpots: sql`${playerStats.jackpots} + ${jackpot}`,
        biggestWin: sql`max(${playerStats.biggestWin}, ${evaluation.freePrize})`,
        bestOdds: sql`max(${playerStats.bestOdds}, ${odds})`,
      },
    })
    .run();
}
