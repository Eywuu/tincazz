import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { ledger, playerStats, spins } from '../src/db/schema.js';
import { playFree } from '../src/features/gamba/play.js';
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
