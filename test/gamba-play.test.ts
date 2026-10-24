import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { ledger, playerStats, pots, spins } from '../src/db/schema.js';
import { InsufficientFundsError } from '../src/features/economy/errors.js';
import { getOrCreateWallet } from '../src/features/economy/wallets.js';
import { playFree, playWager } from '../src/features/gamba/play.js';
import { expectLedgerConsistent } from './support/ledger.js';

let db: Db;

// Draws of 0 are head, 20 is cpp, 18 is python (see gamba.test.ts).
const roll = (...draws: number[]) => {
  const queue = [...draws];
  return () => queue.shift() ?? 0;
};

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('playFree', () => {
  it('pays a yt triple and records the spin and stats', () => {
    const result = playFree(db, 'g', 'u', 10, roll(0, 0, 0));
    expect(result).toMatchObject({ prize: 50, balance: 1_050, reels: ['head', 'head', 'head'] });
    expect(db.select().from(spins).all()).toEqual([
      expect.objectContaining({
        id: result.spinId,
        mode: 'free',
        reels: 'head,head,head',
        result: 'triple',
        bet: 0,
        payout: 50,
        potWon: 0,
      }),
    ]);
    expect(db.select().from(ledger).all().at(-1)).toMatchObject({
      reason: 'free_prize',
      ref: result.spinId,
    });
    expect(db.select().from(playerStats).get()).toMatchObject({
      spins: 1,
      wins: 1,
      jackpots: 0,
      biggestWin: 50,
      bestOdds: 343,
      wagered: 0,
      won: 0,
    });
    expectLedgerConsistent(db);
  });

  it('records a loss without a prize row', () => {
    playFree(db, 'g', 'u', 10, roll(0, 3, 6));
    expect(db.select().from(spins).get()).toMatchObject({ result: 'none', payout: 0 });
    expect(
      db
        .select()
        .from(ledger)
        .all()
        .map((row) => row.reason),
    ).toEqual(['start']);
    expect(db.select().from(playerStats).get()).toMatchObject({ spins: 1, wins: 0 });
    expectLedgerConsistent(db);
  });

  it('counts a jackpot and keeps the best odds', () => {
    playFree(db, 'g', 'u', 10, roll(20, 20, 20));
    expect(db.select().from(playerStats).get()).toMatchObject({
      jackpots: 1,
      biggestWin: 2_500,
      bestOdds: 9_261,
    });
    playFree(db, 'g', 'u', 11, roll(0, 0, 0));
    expect(db.select().from(playerStats).get()).toMatchObject({
      spins: 2,
      wins: 2,
      biggestWin: 2_500,
      bestOdds: 9_261,
    });
    expectLedgerConsistent(db);
  });
});

const reasons = () =>
  db
    .select()
    .from(ledger)
    .all()
    .map((row) => row.reason);

describe('playWager', () => {
  it('takes the bet, feeds the pot and records a loss', () => {
    const result = playWager(db, 'g', 'u', 100, 10, roll(0, 3, 6));
    expect(result).toMatchObject({
      mode: 'wager',
      bet: 100,
      payout: 0,
      potWon: 0,
      balance: 900,
      pot: 10_003,
    });
    expect(reasons()).toEqual(['start', 'bet']);
    expect(db.select().from(ledger).all().at(-1)?.ref).toBe(result.spinId);
    expect(db.select().from(spins).get()).toMatchObject({
      mode: 'wager',
      bet: 100,
      payout: 0,
      potWon: 0,
      result: 'none',
    });
    expect(db.select().from(playerStats).get()).toMatchObject({
      spins: 1,
      wins: 0,
      wagered: 100,
      won: 0,
    });
    expectLedgerConsistent(db);
  });

  it('pays a yt pair and links both ledger rows to the spin', () => {
    const result = playWager(db, 'g', 'u', 100, 10, roll(0, 0, 3));
    expect(result).toMatchObject({ payout: 120, balance: 1_020 });
    expect(reasons()).toEqual(['start', 'bet', 'payout']);
    const rows = db.select().from(ledger).all();
    expect(rows[1]?.ref).toBe(result.spinId);
    expect(rows[2]?.ref).toBe(result.spinId);
    expectLedgerConsistent(db);
  });

  it('pays the payout and the pot on a jackpot', () => {
    const result = playWager(db, 'g', 'u', 500, 10, roll(20, 20, 20));
    expect(result).toMatchObject({
      payout: 150_000,
      potWon: 10_015,
      pot: 10_000,
      balance: 160_515,
    });
    expect(reasons()).toEqual(['start', 'bet', 'payout', 'pot_win']);
    expect(db.select().from(playerStats).get()).toMatchObject({
      jackpots: 1,
      wins: 1,
      wagered: 500,
      won: 160_015,
      biggestWin: 160_015,
      bestOdds: 9_261,
    });
    expectLedgerConsistent(db);
  });

  it('rolls everything back when the wallet cannot cover the bet', () => {
    getOrCreateWallet(db, 'g', 'u', 1);
    expect(() => playWager(db, 'g', 'u', 2_000, 10, roll(0, 3, 6))).toThrow(InsufficientFundsError);
    expect(db.select().from(spins).all()).toEqual([]);
    expect(db.select().from(pots).all()).toEqual([]);
    expect(db.select().from(playerStats).all()).toEqual([]);
    expect(reasons()).toEqual(['start']);
  });

  it('keeps free and wager stats columns together', () => {
    playFree(db, 'g', 'u', 10, roll(0, 3, 6));
    playWager(db, 'g', 'u', 100, 11, roll(0, 3, 6));
    expect(db.select().from(playerStats).get()).toMatchObject({ spins: 2, wagered: 100 });
  });

  it('stays ledger consistent over 200 seeded spins', () => {
    let seed = 12345;
    const next = () => {
      seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648;
      return seed;
    };
    const draw = () => next() % 21;
    let balance = 1_000;
    for (let i = 0; i < 200; i++) {
      const bet = 10 + (next() % 191);
      if (balance < bet) continue;
      balance = playWager(db, 'g', 'u', bet, i, draw).balance;
    }
    expectLedgerConsistent(db);
  });
});
