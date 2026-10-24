import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { ledger, wallets } from '../src/db/schema.js';
import { adminAdjust, InsufficientFundsError } from '../src/features/economy/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

let db: Db;
const base = { guildId: 'g', userId: '1', actorId: '9', reason: 'because', now: 5 };

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('adminAdjust', () => {
  it('gives coins with actor and note on the ledger row', () => {
    expect(adminAdjust(db, { ...base, action: 'give', amount: 500 })).toEqual({
      amount: 500,
      balance: 1_500,
    });
    expect(db.select().from(ledger).all().at(-1)).toMatchObject({
      reason: 'admin_grant',
      actorId: '9',
      note: 'because',
    });
  });

  it('takes coins', () => {
    adminAdjust(db, { ...base, action: 'give', amount: 500 });
    expect(adminAdjust(db, { ...base, action: 'take', amount: 200 }).balance).toBe(1_300);
    expect(db.select().from(ledger).all().at(-1)?.reason).toBe('admin_take');
    expectLedgerConsistent(db);
  });

  it('trims the reason', () => {
    adminAdjust(db, { ...base, reason: '  spaced  ', action: 'give', amount: 1 });
    expect(db.select().from(ledger).all().at(-1)?.note).toBe('spaced');
  });

  it('refuses to take more than the balance', () => {
    adminAdjust(db, { ...base, action: 'give', amount: 1 });
    expect(() => adminAdjust(db, { ...base, action: 'take', amount: 5_000 })).toThrow(
      InsufficientFundsError,
    );
    expect(db.select().from(wallets).get()?.balance).toBe(1_001);
    expectLedgerConsistent(db);
  });

  it('leaves no wallet behind when a take from a new user fails', () => {
    expect(() => adminAdjust(db, { ...base, action: 'take', amount: 1_500 })).toThrow(
      InsufficientFundsError,
    );
    expect(db.select().from(wallets).all()).toEqual([]);
    expect(db.select().from(ledger).all()).toEqual([]);
  });

  it.each([0, 1_000_001, 2.5])('rejects amount %s', (amount) => {
    expect(() => adminAdjust(db, { ...base, action: 'give', amount })).toThrow(RangeError);
  });

  it.each(['   ', 'x'.repeat(201)])('rejects reason %j', (reason) => {
    expect(() => adminAdjust(db, { ...base, reason, action: 'give', amount: 5 })).toThrow(
      RangeError,
    );
  });
});
