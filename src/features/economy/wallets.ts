import { and, eq, gt, isNull, or, sql } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { startingBalance } from './config.js';
import { credit } from './ledger.js';

export type Wallet = typeof wallets.$inferSelect;

export function findWallet(db: DbOrTx, guildId: string, userId: string): Wallet | undefined {
  return db
    .select()
    .from(wallets)
    .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
    .get();
}

/** Returns the wallet, creating it with the starting balance (and its `start` row) if missing. */
export function getOrCreateWallet(
  db: DbOrTx,
  guildId: string,
  userId: string,
  now: number,
): Wallet {
  return db.transaction((tx) => {
    const existing = findWallet(tx, guildId, userId);
    if (existing) {
      return existing;
    }
    tx.insert(wallets).values({ guildId, userId, balance: 0, createdAt: now }).run();
    credit(tx, { guildId, userId, amount: startingBalance, reason: 'start', now });
    return findWallet(tx, guildId, userId) as Wallet;
  });
}

/** 1 + wallets with a higher balance, or an equal balance and a smaller numeric user id. */
export function coinsRank(db: DbOrTx, guildId: string, userId: string): number | undefined {
  const wallet = findWallet(db, guildId, userId);
  if (!wallet || wallet.departedAt !== null) {
    return undefined;
  }
  const ahead = db
    .select({ count: sql<number>`count(*)` })
    .from(wallets)
    .where(
      and(
        eq(wallets.guildId, guildId),
        isNull(wallets.departedAt),
        or(
          gt(wallets.balance, wallet.balance),
          and(
            eq(wallets.balance, wallet.balance),
            sql`cast(${wallets.userId} as integer) < cast(${userId} as integer)`,
          ),
        ),
      ),
    )
    .get();
  return 1 + (ahead?.count ?? 0);
}
