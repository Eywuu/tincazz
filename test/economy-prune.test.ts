import { beforeEach, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { ledger, playerStats, wallets } from '../src/db/schema.js';
import { startingBalance } from '../src/features/economy/config.js';
import { purgeWallet } from '../src/features/economy/prune.js';
import { getOrCreateWallet } from '../src/features/economy/wallets.js';
import { expectLedgerConsistent } from './support/ledger.js';

let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
});

const rowsFor = (userId: string) =>
  db
    .select()
    .from(ledger)
    .all()
    .filter((row) => row.userId === userId);

it('removes the balance with a pruned row and deletes wallet and stats', () => {
  getOrCreateWallet(db, '2', '1', 0);
  db.update(wallets).set({ balance: 700 }).run();
  db.delete(ledger).run();
  db.insert(ledger)
    .values({
      guildId: '2',
      userId: '1',
      delta: 700,
      balanceAfter: 700,
      reason: 'admin_grant',
      createdAt: 0,
    })
    .run();
  db.insert(playerStats).values({ guildId: '2', userId: '1', spins: 3 }).run();

  expect(purgeWallet(db, '2', '1', 50)).toBe(700);

  const pruned = rowsFor('1').find((row) => row.reason === 'pruned');
  expect(pruned).toMatchObject({ delta: -700, balanceAfter: 0, createdAt: 50 });
  expect(db.select().from(wallets).all()).toHaveLength(0);
  expect(db.select().from(playerStats).all()).toHaveLength(0);

  getOrCreateWallet(db, '2', '1', 60);
  const sum = rowsFor('1').reduce((total, row) => total + row.delta, 0);
  expect(sum).toBe(startingBalance);
  expectLedgerConsistent(db);
});

it('writes no ledger row for a zero balance and returns 0 without a wallet', () => {
  getOrCreateWallet(db, '2', '1', 0);
  db.update(wallets).set({ balance: 0 }).run();
  const before = rowsFor('1').length;
  expect(purgeWallet(db, '2', '1', 5)).toBe(0);
  expect(rowsFor('1')).toHaveLength(before);
  expect(db.select().from(wallets).all()).toHaveLength(0);
  expect(purgeWallet(db, '2', '9', 5)).toBe(0);
});
