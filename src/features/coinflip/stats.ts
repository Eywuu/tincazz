import { sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { playerStats } from '../../db/schema.js';

/** Counts a flip in `player_stats`; `credited` is what the player was paid (0 on a loss). */
export function recordFlipStats(
  tx: DbOrTx,
  guildId: string,
  userId: string,
  flip: { bet: number; won: boolean; credited: number },
): void {
  const win = flip.won ? 1 : 0;
  tx.insert(playerStats)
    .values({
      guildId,
      userId,
      flips: 1,
      flipWins: win,
      flipWagered: flip.bet,
      flipWon: flip.credited,
    })
    .onConflictDoUpdate({
      target: [playerStats.guildId, playerStats.userId],
      set: {
        flips: sql`${playerStats.flips} + 1`,
        flipWins: sql`${playerStats.flipWins} + ${win}`,
        flipWagered: sql`${playerStats.flipWagered} + ${flip.bet}`,
        flipWon: sql`${playerStats.flipWon} + ${flip.credited}`,
      },
    })
    .run();
}
