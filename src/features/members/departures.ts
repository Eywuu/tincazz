import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import type { Wallet } from '../economy/wallets.js';

/** Marks a wallet as departed, only where it is not already. Returns the updated wallet. */
export function markDeparted(
  db: DbOrTx,
  guildId: string,
  userId: string,
  now: number,
): Wallet | undefined {
  return db
    .update(wallets)
    .set({ departedAt: now })
    .where(
      and(eq(wallets.guildId, guildId), eq(wallets.userId, userId), isNull(wallets.departedAt)),
    )
    .returning()
    .get();
}

/** Clears the departed mark, only where set. Returns the updated wallet. */
export function markPresent(db: DbOrTx, guildId: string, userId: string): Wallet | undefined {
  return db
    .update(wallets)
    .set({ departedAt: null })
    .where(
      and(eq(wallets.guildId, guildId), eq(wallets.userId, userId), isNotNull(wallets.departedAt)),
    )
    .returning()
    .get();
}
