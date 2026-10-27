import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import {
  CollectNotReadyError,
  claimCollect,
  claimErrorText,
  collectCard,
  findWallet,
  getOrCreateWallet,
} from '../src/features/economy/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

const HOUR = 3_600_000;
const g = 'g';
const u = '1';
let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
});

const notReady = (now: number) => {
  try {
    claimCollect(db, g, u, now);
  } catch (error) {
    return error;
  }
  return undefined;
};

describe('claimCollect', () => {
  it('accrues from wallet creation and refuses before the first full hour', () => {
    getOrCreateWallet(db, g, u, 1_000);
    const error = notReady(1_000 + HOUR - 1);
    expect(error).toBeInstanceOf(CollectNotReadyError);
    expect((error as CollectNotReadyError).availableAt).toBe(1_000 + HOUR);
    expect(claimErrorText(error)).toContain('Nothing to collect yet.');

    expect(claimCollect(db, g, u, 1_000 + HOUR)).toEqual({
      amount: 25,
      hours: 1,
      balance: 1_025,
      nextAt: 1_000 + 2 * HOUR,
      fullAt: 1_000 + 13 * HOUR,
    });
    expectLedgerConsistent(db);
  });

  it('pays nothing for the time before the wallet existed, and writes nothing', () => {
    expect(notReady(5 * HOUR)).toBeInstanceOf(CollectNotReadyError);
    expect(findWallet(db, g, u)).toBeUndefined();
  });

  it('carries a partial hour over to the next collect', () => {
    getOrCreateWallet(db, g, u, 0);
    expect(claimCollect(db, g, u, 2.5 * HOUR)).toMatchObject({ amount: 50, hours: 2 });
    expect(findWallet(db, g, u)?.lastCollectAt).toBe(2 * HOUR);
    // Half an hour left over plus another half: one more full hour.
    expect(claimCollect(db, g, u, 3 * HOUR)).toMatchObject({ amount: 25, hours: 1 });
    expectLedgerConsistent(db);
  });

  it('stacks up to 12 hours and drops the rest', () => {
    getOrCreateWallet(db, g, u, 0);
    const result = claimCollect(db, g, u, 30.5 * HOUR);
    expect(result).toMatchObject({ amount: 300, hours: 12, balance: 1_300 });
    expect(result.nextAt).toBe(31.5 * HOUR);
    expect(notReady(31.5 * HOUR - 1)).toBeInstanceOf(CollectNotReadyError);
    expectLedgerConsistent(db);
  });

  it('records a collect ledger row', () => {
    getOrCreateWallet(db, g, u, 0);
    claimCollect(db, g, u, 3 * HOUR);
    const rows = db.$client.prepare('select reason, delta from ledger order by id').all();
    expect(rows).toEqual([
      { reason: 'start', delta: 1_000 },
      { reason: 'collect', delta: 75 },
    ]);
  });
});

describe('collectCard', () => {
  it('shows the amount, the stack and the next times', () => {
    const text = JSON.stringify(
      collectCard({
        amount: 75,
        hours: 3,
        balance: 1_075,
        nextAt: 7_200_000,
        fullAt: 43_200_000,
      }).toJSON(),
    );
    expect(text).toContain('+75 coins · 3 hours stacked');
    expect(text).toContain('Balance: 1,075');
    expect(text).toContain('<t:7200:R>');
  });
});
