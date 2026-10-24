import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { pots } from '../src/db/schema.js';
import { potContribution, potShare, settlePot } from '../src/features/gamba/pot.js';

function rowOf(db: ReturnType<typeof openDatabase>, guildId: string) {
  return db.select().from(pots).where(eq(pots.guildId, guildId)).get();
}

describe('potContribution', () => {
  it('takes 3 percent with a floor of one coin', () => {
    expect(potContribution(10)).toBe(1);
    expect(potContribution(33)).toBe(1);
    expect(potContribution(100)).toBe(3);
    expect(potContribution(10_000)).toBe(300);
  });
});

describe('potShare', () => {
  it('pays the full pot from 500 and a proportional share below', () => {
    expect(potShare(10_000, 100)).toBe(2_000);
    expect(potShare(10_000, 500)).toBe(10_000);
    expect(potShare(10_000, 9_000)).toBe(10_000);
    expect(potShare(10_001, 10)).toBe(200);
  });
});

describe('settlePot', () => {
  it('seeds and grows the pot without a jackpot', () => {
    const db = openDatabase(':memory:');
    expect(settlePot(db, 'g', 100, false, 'u', 1)).toEqual({ potWon: 0, pot: 10_003 });
    expect(rowOf(db, 'g')).toMatchObject({ amount: 10_003, lastWinnerId: null });
  });

  it('pays the whole pot on a full-share jackpot and resets to the seed', () => {
    const db = openDatabase(':memory:');
    expect(settlePot(db, 'g', 500, true, 'u', 42)).toEqual({ potWon: 10_015, pot: 10_000 });
    expect(rowOf(db, 'g')).toMatchObject({ lastWinnerId: 'u', lastWonAt: 42 });
  });

  it('tops the remainder up to the seed', () => {
    const db = openDatabase(':memory:');
    expect(settlePot(db, 'g', 100, true, 'u', 1)).toEqual({ potWon: 2_000, pot: 10_000 });
  });

  it('keeps the remainder when it exceeds the seed', () => {
    const db = openDatabase(':memory:');
    settlePot(db, 'g', 100, false, 'u', 1);
    db.update(pots).set({ amount: 100_000 }).where(eq(pots.guildId, 'g')).run();
    expect(settlePot(db, 'g', 10, true, 'u', 2)).toEqual({ potWon: 2_000, pot: 98_001 });
  });

  it('keeps guilds separate', () => {
    const db = openDatabase(':memory:');
    settlePot(db, 'a', 100, false, 'u', 1);
    expect(settlePot(db, 'b', 10, false, 'u', 1).pot).toBe(10_001);
    expect(rowOf(db, 'a')?.amount).toBe(10_003);
  });
});
