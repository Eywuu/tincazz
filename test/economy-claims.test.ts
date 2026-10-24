import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { ledger } from '../src/db/schema.js';
import {
  AlreadyClaimedError,
  CooldownError,
  claimBailout,
  claimDaily,
  credit,
  debit,
  findWallet,
  getOrCreateWallet,
  NotEligibleError,
} from '../src/features/economy/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

const DAY = 86_400_000;
const HOUR = 3_600_000;
const g = 'g';
const u = '1';
let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('claimDaily', () => {
  it('pays 250 on day 1 and grows with the streak up to day 7', () => {
    const paid: number[] = [];
    for (let day = 100; day < 109; day++) {
      paid.push(claimDaily(db, g, u, day * DAY + 5).amount);
    }
    expect(paid).toEqual([250, 300, 350, 400, 450, 500, 550, 550, 550]);
    expect(findWallet(db, g, u)?.dailyStreak).toBe(9);
    expectLedgerConsistent(db);
  });

  it('resets the streak after a gap of 2 days', () => {
    claimDaily(db, g, u, 100 * DAY);
    claimDaily(db, g, u, 101 * DAY);
    const result = claimDaily(db, g, u, 103 * DAY);
    expect(result).toMatchObject({ amount: 250, streak: 1 });
    expectLedgerConsistent(db);
  });

  it('refuses a second claim on the same UTC day', () => {
    claimDaily(db, g, u, 100 * DAY + 10);
    const error = (() => {
      try {
        claimDaily(db, g, u, 100 * DAY + 20);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(AlreadyClaimedError);
    expect((error as AlreadyClaimedError).nextAt).toBe(101 * DAY);
    expectLedgerConsistent(db);
  });

  it('allows a claim right across midnight', () => {
    claimDaily(db, g, u, 100 * DAY - 1);
    const result = claimDaily(db, g, u, 100 * DAY);
    expect(result.streak).toBe(2);
    expect(result.nextAt).toBe(101 * DAY);
    expectLedgerConsistent(db);
  });

  it('creates the wallet on first interaction and credits on top', () => {
    const result = claimDaily(db, g, u, 100 * DAY);
    expect(result.balance).toBe(1_250);
    expect(
      db
        .select()
        .from(ledger)
        .all()
        .map((row) => row.reason),
    ).toEqual(['start', 'daily']);
    expectLedgerConsistent(db);
  });
});

describe('claimBailout', () => {
  it('is not for a healthy balance', () => {
    getOrCreateWallet(db, g, u, 0);
    const error = (() => {
      try {
        claimBailout(db, g, u, 1);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(NotEligibleError);
    expect((error as NotEligibleError).balance).toBe(1_000);
    expectLedgerConsistent(db);
  });

  it('pays 200 below 10 coins, then enforces an hour cooldown', () => {
    getOrCreateWallet(db, g, u, 0);
    debit(db, { guildId: g, userId: u, amount: 995, reason: 'bet', now: 1 });
    expect(claimBailout(db, g, u, 1_000)).toEqual({ amount: 200, balance: 205 });

    debit(db, { guildId: g, userId: u, amount: 200, reason: 'bet', now: 2 });
    const error = (() => {
      try {
        claimBailout(db, g, u, 1_000 + HOUR - 1);
      } catch (e) {
        return e;
      }
    })();
    expect(error).toBeInstanceOf(CooldownError);
    expect((error as CooldownError).availableAt).toBe(1_000 + HOUR);

    expect(claimBailout(db, g, u, 1_000 + HOUR).amount).toBe(200);
    expectLedgerConsistent(db);
  });

  it('checks eligibility before the cooldown', () => {
    getOrCreateWallet(db, g, u, 0);
    debit(db, { guildId: g, userId: u, amount: 995, reason: 'bet', now: 1 });
    claimBailout(db, g, u, 1_000);
    credit(db, { guildId: g, userId: u, amount: 500, reason: 'daily', now: 2 });
    expect(() => claimBailout(db, g, u, 1_001)).toThrow(NotEligibleError);
  });
});
