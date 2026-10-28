import { and, desc, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { type FlipSide, flips, rolls } from '../../db/schema.js';
import type { DiceCall } from '../dice/index.js';

export type RecentPlay =
  | { kind: 'flip'; at: number; net: number; result: FlipSide; opponentId?: string }
  | { kind: 'roll'; at: number; net: number; die1: number; die2: number; call: DiceCall };

/**
 * A player's latest coinflips (either side of a challenge) and dice rolls, newest first. Flip rows
 * only exist once settled, so every one has a result and a net.
 */
export function recentPlays(db: DbOrTx, guildId: string, userId: string, limit = 5): RecentPlay[] {
  // One query per indexed column instead of an OR, each cut to `limit` before the merge.
  const flipRows = (column: typeof flips.challengerId | typeof flips.opponentId) =>
    db
      .select()
      .from(flips)
      .where(and(eq(flips.guildId, guildId), eq(column, userId)))
      .orderBy(desc(flips.createdAt), desc(flips.id))
      .limit(limit)
      .all();
  const flipRowsById = new Map(
    [...flipRows(flips.challengerId), ...flipRows(flips.opponentId)].map((row) => [row.id, row]),
  );
  const plays: { id: number; play: RecentPlay }[] = [...flipRowsById.values()].map((row) => {
    const credited = 2 * row.bet - row.rake;
    const other = row.challengerId === userId ? row.opponentId : row.challengerId;
    const play: RecentPlay = {
      kind: 'flip',
      at: row.createdAt,
      net: row.winnerId === userId ? credited - row.bet : -row.bet,
      result: row.resultSide,
    };
    if (other !== null) {
      play.opponentId = other;
    }
    return { id: row.id, play };
  });

  const rollRows = db
    .select()
    .from(rolls)
    .where(and(eq(rolls.guildId, guildId), eq(rolls.userId, userId)))
    .orderBy(desc(rolls.createdAt), desc(rolls.id))
    .limit(limit)
    .all();
  for (const row of rollRows) {
    const call: DiceCall =
      row.call === 'exact' ? { kind: 'exact', target: row.target ?? 0 } : { kind: row.call };
    plays.push({
      id: row.id,
      play: {
        kind: 'roll',
        at: row.createdAt,
        net: row.payout - row.bet,
        die1: row.die1,
        die2: row.die2,
        call,
      },
    });
  }

  // Newest first; on a tie the later row (larger id) leads, flips ahead of rolls.
  return plays
    .sort((a, b) => b.play.at - a.play.at || b.id - a.id)
    .slice(0, limit)
    .map(({ play }) => play);
}
