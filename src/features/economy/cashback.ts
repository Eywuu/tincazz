import { and, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { type LedgerReason, ledger } from '../../db/schema.js';
import { cashback } from './config.js';
import { dayMs, utcDay } from './time.js';

/** Ledger reasons that count as gambling: stakes in, winnings out. */
export const gamblingReasons = [
  'bet',
  'payout',
  'pot_win',
  'flip_bet',
  'flip_win',
  'dice_bet',
  'dice_win',
] as const satisfies readonly LedgerReason[];

/** Net coins won (positive) or lost (negative) gambling during the UTC day before `now`. */
export function yesterdayGamblingNet(
  tx: DbOrTx,
  guildId: string,
  userId: string,
  now: number,
): number {
  const start = (utcDay(now) - 1) * dayMs;
  const row = tx
    .select({ net: sql<number>`coalesce(sum(${ledger.delta}), 0)` })
    .from(ledger)
    .where(
      and(
        eq(ledger.guildId, guildId),
        eq(ledger.userId, userId),
        inArray(ledger.reason, gamblingReasons),
        gte(ledger.createdAt, start),
        lt(ledger.createdAt, start + dayMs),
      ),
    )
    .get();
  return row?.net ?? 0;
}

/** The cashback owed on yesterday's net losses: a percentage, capped; 0 after a winning day. */
export function cashbackFor(tx: DbOrTx, guildId: string, userId: string, now: number): number {
  const net = yesterdayGamblingNet(tx, guildId, userId, now);
  if (net >= 0) return 0;
  return Math.min(cashback.max, Math.floor((-net * cashback.percent) / 100));
}
