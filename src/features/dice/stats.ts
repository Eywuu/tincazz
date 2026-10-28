import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { playerStats } from '../../db/schema.js';

/** Counts a roll in `player_stats`; `payout` is what the player was paid (0 on a loss). */
export function recordRollStats(
  tx: DbOrTx,
  guildId: string,
  userId: string,
  roll: { bet: number; won: boolean; payout: number },
): void {
  const win = roll.won ? 1 : 0;
  tx.insert(playerStats)
    .values({
      guildId,
      userId,
      rolls: 1,
      rollWins: win,
      rollWagered: roll.bet,
      rollWon: roll.payout,
    })
    .onConflictDoUpdate({
      target: [playerStats.guildId, playerStats.userId],
      set: {
        rolls: sql`${playerStats.rolls} + 1`,
        rollWins: sql`${playerStats.rollWins} + ${win}`,
        rollWagered: sql`${playerStats.rollWagered} + ${roll.bet}`,
        rollWon: sql`${playerStats.rollWon} + ${roll.payout}`,
      },
    })
    .run();
}
