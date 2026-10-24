import { and, eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { type LedgerReason, ledger, wallets } from '../../db/schema.js';
import { InsufficientFundsError } from './errors.js';

export interface LedgerEntry {
  guildId: string;
  userId: string;
  amount: number;
  reason: LedgerReason;
  now: number;
  ref?: number;
  actorId?: string;
  note?: string;
}

/** Adds coins to an existing wallet and appends the ledger row. Returns the new balance. */
export function credit(tx: DbOrTx, entry: LedgerEntry): number {
  return apply(tx, entry, 1);
}

/** Removes coins from an existing wallet; throws instead of going negative. */
export function debit(tx: DbOrTx, entry: LedgerEntry): number {
  return apply(tx, entry, -1);
}

function apply(tx: DbOrTx, entry: LedgerEntry, sign: 1 | -1): number {
  const { guildId, userId, amount } = entry;
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new RangeError(`Amount must be a positive integer, got ${amount}`);
  }
  return tx.transaction((inner) => {
    const where = and(eq(wallets.guildId, guildId), eq(wallets.userId, userId));
    const wallet = inner.select().from(wallets).where(where).get();
    if (!wallet) {
      throw new Error(`No wallet for user ${userId} in guild ${guildId}`);
    }
    const balance = wallet.balance + sign * amount;
    if (balance < 0) {
      throw new InsufficientFundsError(wallet.balance, amount);
    }
    inner.update(wallets).set({ balance }).where(where).run();
    inner
      .insert(ledger)
      .values({
        guildId,
        userId,
        delta: sign * amount,
        balanceAfter: balance,
        reason: entry.reason,
        ref: entry.ref ?? null,
        actorId: entry.actorId ?? null,
        note: entry.note ?? null,
        createdAt: entry.now,
      })
      .run();
    return balance;
  });
}
