import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import type { LedgerReason } from '../src/db/schema.js';
import {
  cashbackFor,
  claimDaily,
  credit,
  dailyCard,
  debit,
  getOrCreateWallet,
} from '../src/features/economy/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

const DAY = 86_400_000;
const g = 'g';
const u = '1';
let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
  getOrCreateWallet(db, g, u, 0);
  credit(db, { guildId: g, userId: u, amount: 100_000, reason: 'admin_grant', now: 0 });
});

const move = (reason: LedgerReason, delta: number, now: number) =>
  delta < 0
    ? debit(db, { guildId: g, userId: u, amount: -delta, reason, now })
    : credit(db, { guildId: g, userId: u, amount: delta, reason, now });

describe('cashbackFor', () => {
  it("pays 10% of yesterday's net loss across spins and flips", () => {
    move('bet', -500, 99 * DAY + 10);
    move('payout', 200, 99 * DAY + 10);
    move('flip_bet', -300, 99 * DAY + 20);
    move('flip_win', 100, 99 * DAY + 20);
    expect(cashbackFor(db, g, u, 100 * DAY + 5)).toBe(50);
  });

  it('pays nothing after a winning or even day', () => {
    move('bet', -100, 99 * DAY);
    move('payout', 200, 99 * DAY);
    expect(cashbackFor(db, g, u, 100 * DAY)).toBe(0);
    expect(cashbackFor(db, g, u, 101 * DAY)).toBe(0);
  });

  it('counts only the previous UTC day', () => {
    move('bet', -1_000, 98 * DAY + DAY - 1);
    move('bet', -1_000, 100 * DAY);
    move('bet', -100, 99 * DAY);
    move('bet', -100, 100 * DAY - 1);
    expect(cashbackFor(db, g, u, 100 * DAY + 1)).toBe(20);
  });

  it('ignores income that is not gambling', () => {
    move('bet', -1_000, 99 * DAY);
    move('daily', 500, 99 * DAY);
    move('admin_grant', 500, 99 * DAY);
    expect(cashbackFor(db, g, u, 100 * DAY)).toBe(100);
  });

  it('caps at 1,000', () => {
    move('bet', -50_000, 99 * DAY);
    expect(cashbackFor(db, g, u, 100 * DAY)).toBe(1_000);
  });

  it('looks only at this user in this guild', () => {
    getOrCreateWallet(db, g, '2', 0);
    debit(db, { guildId: g, userId: '2', amount: 500, reason: 'bet', now: 99 * DAY });
    expect(cashbackFor(db, g, u, 100 * DAY)).toBe(0);
    expect(cashbackFor(db, g, '2', 100 * DAY)).toBe(50);
  });
});

describe('claimDaily with cashback', () => {
  it('credits the cashback as its own ledger row and shows it on the card', () => {
    move('bet', -2_000, 99 * DAY);
    const result = claimDaily(db, g, u, 100 * DAY);
    expect(result).toMatchObject({ amount: 475, cashback: 200, balance: 101_000 - 2_000 + 675 });
    const rows = db.$client
      .prepare("select reason, delta from ledger where reason in ('daily', 'cashback') order by id")
      .all();
    expect(rows).toEqual([
      { reason: 'daily', delta: 475 },
      { reason: 'cashback', delta: 200 },
    ]);
    expect(JSON.stringify(dailyCard(result).toJSON())).toContain(
      "+200 cashback on yesterday's losses",
    );
    expectLedgerConsistent(db);
  });

  it('writes no cashback row and no card line after a winning day', () => {
    const result = claimDaily(db, g, u, 100 * DAY);
    expect(result.cashback).toBe(0);
    expect(
      db.$client.prepare("select count(*) from ledger where reason = 'cashback'").pluck().get(),
    ).toBe(0);
    expect(JSON.stringify(dailyCard(result).toJSON())).not.toContain('cashback');
  });
});
