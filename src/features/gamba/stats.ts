import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { playerStats } from '../../db/schema.js';
import type { Evaluation } from './evaluate.js';

/** Counts a free spin in `player_stats`; coin columns are left alone (free spins win no coins). */
export function recordFreeSpinStats(
  tx: DbOrTx,
  guildId: string,
  userId: string,
  evaluation: Evaluation,
): void {
  const jackpot = evaluation.result === 'jackpot' ? 1 : 0;
  const odds = evaluation.odds ?? 0;
  tx.insert(playerStats)
    .values({
      guildId,
      userId,
      spins: 1,
      jackpots: jackpot,
      bestOdds: odds,
    })
    .onConflictDoUpdate({
      target: [playerStats.guildId, playerStats.userId],
      set: {
        spins: sql`${playerStats.spins} + 1`,
        jackpots: sql`${playerStats.jackpots} + ${jackpot}`,
        bestOdds: sql`max(${playerStats.bestOdds}, ${odds})`,
      },
    })
    .run();
}

/** Counts a wagered spin in `player_stats`, including the wager columns. */
export function recordWagerSpinStats(
  tx: DbOrTx,
  guildId: string,
  userId: string,
  spin: { evaluation: Evaluation; bet: number; payout: number; potWon: number },
): void {
  const { evaluation, bet } = spin;
  const total = spin.payout + spin.potWon;
  const win = total > 0 ? 1 : 0;
  const jackpot = evaluation.result === 'jackpot' ? 1 : 0;
  const odds = evaluation.odds ?? 0;
  tx.insert(playerStats)
    .values({
      guildId,
      userId,
      spins: 1,
      wins: win,
      jackpots: jackpot,
      wagered: bet,
      won: total,
      biggestWin: total,
      bestOdds: odds,
    })
    .onConflictDoUpdate({
      target: [playerStats.guildId, playerStats.userId],
      set: {
        spins: sql`${playerStats.spins} + 1`,
        wins: sql`${playerStats.wins} + ${win}`,
        jackpots: sql`${playerStats.jackpots} + ${jackpot}`,
        wagered: sql`${playerStats.wagered} + ${bet}`,
        won: sql`${playerStats.won} + ${total}`,
        biggestWin: sql`max(${playerStats.biggestWin}, ${total})`,
        bestOdds: sql`max(${playerStats.bestOdds}, ${odds})`,
      },
    })
    .run();
}
