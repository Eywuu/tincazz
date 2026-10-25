import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { playerStats, wallets } from '../../db/schema.js';
import { debit } from './ledger.js';
import { findWallet } from './wallets.js';

/** Removes a departed member's wallet and stats, ledgering the removed coins. Returns the coins removed. */
export function purgeWallet(tx: DbOrTx, guildId: string, userId: string, now: number): number {
  return tx.transaction((inner) => {
    const wallet = findWallet(inner, guildId, userId);
    if (!wallet) return 0;
    if (wallet.balance > 0) {
      debit(inner, { guildId, userId, amount: wallet.balance, reason: 'pruned', now });
    }
    inner
      .delete(playerStats)
      .where(and(eq(playerStats.guildId, guildId), eq(playerStats.userId, userId)))
      .run();
    inner
      .delete(wallets)
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .run();
    return wallet.balance;
  });
}
