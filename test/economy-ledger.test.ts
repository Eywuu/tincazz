import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { ledger, wallets } from '../src/db/schema.js';
import {
  coinsRank,
  credit,
  debit,
  findWallet,
  getOrCreateWallet,
  InsufficientFundsError,
} from '../src/features/economy/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

const guildId = 'g';
let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('getOrCreateWallet', () => {
  it('creates a wallet with the starting balance and one start row', () => {
    const wallet = getOrCreateWallet(db, guildId, '1', 100);
    expect(wallet.balance).toBe(1_000);
    const rows = db.select().from(ledger).all();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: 'start', delta: 1_000, balanceAfter: 1_000 });
  });

  it('returns the same wallet on a second call without new rows', () => {
    const first = getOrCreateWallet(db, guildId, '1', 100);
    const second = getOrCreateWallet(db, guildId, '1', 200);
    expect(second).toEqual(first);
    expect(db.select().from(ledger).all()).toHaveLength(1);
  });

  it('findWallet never creates', () => {
    expect(findWallet(db, guildId, '1')).toBeUndefined();
    expect(db.select().from(wallets).all()).toHaveLength(0);
  });
});

describe('credit and debit', () => {
  it('return the running balance and write ledger details', () => {
    getOrCreateWallet(db, guildId, '1', 0);
    expect(credit(db, { guildId, userId: '1', amount: 500, reason: 'daily', now: 1, ref: 7 })).toBe(
      1_500,
    );
    expect(
      debit(db, {
        guildId,
        userId: '1',
        amount: 200,
        reason: 'admin_take',
        now: 2,
        actorId: '9',
        note: 'why',
      }),
    ).toBe(1_300);
    const last = db.select().from(ledger).all().at(-1);
    expect(last).toMatchObject({
      delta: -200,
      balanceAfter: 1_300,
      actorId: '9',
      note: 'why',
    });
    expect(db.select().from(ledger).all().at(-2)?.ref).toBe(7);
    expectLedgerConsistent(db);
  });

  it('refuses to overdraw and leaves both tables unchanged', () => {
    getOrCreateWallet(db, guildId, '1', 0);
    const error = (() => {
      try {
        debit(db, { guildId, userId: '1', amount: 5_000, reason: 'bet', now: 1 });
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(InsufficientFundsError);
    expect(error).toMatchObject({ balance: 1_000, needed: 5_000 });
    expect(findWallet(db, guildId, '1')?.balance).toBe(1_000);
    expect(db.select().from(ledger).all()).toHaveLength(1);
  });

  it.each([0, -5, 1.5])('rejects the amount %s', (amount) => {
    getOrCreateWallet(db, guildId, '1', 0);
    expect(() => credit(db, { guildId, userId: '1', amount, reason: 'daily', now: 1 })).toThrow(
      RangeError,
    );
  });

  it('throws when the wallet does not exist', () => {
    expect(() => credit(db, { guildId, userId: '1', amount: 1, reason: 'daily', now: 1 })).toThrow(
      'wallet',
    );
  });

  it('keeps the invariant over a random sequence', () => {
    let seed = 12345;
    const next = (max: number) => {
      seed = (seed * 1103515245 + 12345) % 2_147_483_648;
      return seed % max;
    };
    const users = ['1', '2', '3', '4', '5'];
    for (const userId of users) getOrCreateWallet(db, guildId, userId, 0);
    for (let i = 0; i < 500; i++) {
      const userId = users[next(users.length)] as string;
      const amount = 1 + next(700);
      try {
        if (next(2) === 0) {
          credit(db, { guildId, userId, amount, reason: 'daily', now: i });
        } else {
          debit(db, { guildId, userId, amount, reason: 'bet', now: i });
        }
      } catch (error) {
        if (!(error instanceof InsufficientFundsError)) throw error;
      }
    }
    expectLedgerConsistent(db);
  });
});

describe('coinsRank', () => {
  it('ranks by balance', () => {
    for (const id of ['1', '2', '3']) getOrCreateWallet(db, guildId, id, 0);
    credit(db, { guildId, userId: '1', amount: 500, reason: 'daily', now: 1 });
    expect([1, 2, 3].map((id) => coinsRank(db, guildId, String(id)))).toEqual([1, 2, 3]);
  });

  it('breaks ties by numeric user id', () => {
    getOrCreateWallet(db, guildId, '10', 0);
    getOrCreateWallet(db, guildId, '9', 0);
    expect(coinsRank(db, guildId, '9')).toBe(1);
    expect(coinsRank(db, guildId, '10')).toBe(2);
  });

  it('is undefined for an unknown user', () => {
    expect(coinsRank(db, guildId, '1')).toBeUndefined();
  });
});
