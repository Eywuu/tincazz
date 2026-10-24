import { expect } from 'vitest';
import type { Db } from '../../src/db/index.js';
import { ledger, wallets } from '../../src/db/schema.js';

/** Asserts that every wallet's balance equals its ledger sum and its newest `balance_after`. */
export function expectLedgerConsistent(db: Db): void {
  for (const wallet of db.select().from(wallets).all()) {
    const rows = db
      .select()
      .from(ledger)
      .all()
      .filter((row) => row.guildId === wallet.guildId && row.userId === wallet.userId)
      .sort((a, b) => a.id - b.id);
    const sum = rows.reduce((total, row) => total + row.delta, 0);
    expect(sum, `ledger sum for ${wallet.userId}`).toBe(wallet.balance);
    expect(rows.at(-1)?.balanceAfter, `last balance_after for ${wallet.userId}`).toBe(
      wallet.balance,
    );
  }
}
