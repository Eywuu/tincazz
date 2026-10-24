import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { pots, spins } from '../src/db/schema.js';
import { InsufficientFundsError } from '../src/features/economy/index.js';
import { InvalidBetError } from '../src/features/gamba/index.js';
import { settleSpin, spin } from '../src/features/gamba/spin.js';

function draws(...values: number[]) {
  const queue = [...values];
  return () => queue.shift() ?? 0;
}

const json = (value: unknown) => JSON.stringify(value);

describe('spin', () => {
  let db: Db;
  const request = { guildId: '2', userId: '1' };

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('announces a free triple without assigning a role', async () => {
    const assignJackpotRole = vi.fn(async () => true);
    const result = await spin(db, request, 1000, {
      assignJackpotRole,
      randomInt: draws(0, 0, 0),
    });

    expect(json(result.card)).toContain('free spin');
    expect(result.announcement).toBeDefined();
    expect(assignJackpotRole).not.toHaveBeenCalled();
  });

  it('has no announcement on a free loss', async () => {
    const result = await spin(db, request, 1000, {
      assignJackpotRole: async () => true,
      randomInt: draws(0, 3, 6),
    });

    expect(result.announcement).toBeUndefined();
  });

  it('settles a wager and does not announce a pair', async () => {
    const result = await spin(db, { ...request, bet: '100' }, 1000, {
      assignJackpotRole: async () => true,
      randomInt: draws(0, 0, 3),
    });

    expect(json(result.card)).toContain('Bet 100 → 120');
    expect(result.announcement).toBeUndefined();
  });

  it('assigns the role once on a wagered jackpot', async () => {
    const assignJackpotRole = vi.fn(async () => true);
    const result = await spin(db, { ...request, bet: '500' }, 1000, {
      assignJackpotRole,
      randomInt: draws(20, 20, 20),
    });

    expect(assignJackpotRole).toHaveBeenCalledTimes(1);
    expect(json(result.announcement)).toContain('You are a pro!');
  });

  it('notes a failed role assignment in the announcement', async () => {
    const result = await spin(db, { ...request, bet: '500' }, 1000, {
      assignJackpotRole: async () => false,
      randomInt: draws(20, 20, 20),
    });

    expect(json(result.announcement)).toContain("couldn't assign the role");
  });

  it('rejects an invalid bet and changes nothing', async () => {
    await expect(
      spin(db, { ...request, bet: 'lol' }, 1000, { assignJackpotRole: async () => true }),
    ).rejects.toBeInstanceOf(InvalidBetError);
    expect(db.select().from(spins).all()).toEqual([]);
    expect(db.select().from(pots).all()).toEqual([]);
  });

  it('rejects a bet above the balance and changes nothing', async () => {
    await expect(
      spin(db, { ...request, bet: '5000' }, 1000, { assignJackpotRole: async () => true }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
    expect(db.select().from(spins).all()).toEqual([]);
  });
});

describe('settleSpin', () => {
  it('returns the settled spin and the role result on a jackpot', async () => {
    const db = openDatabase(':memory:');
    const settled = await settleSpin(db, { guildId: 'g', userId: 'u' }, 1000, {
      assignJackpotRole: async () => false,
      randomInt: () => 20,
    });
    expect(settled.played.evaluation.result).toBe('jackpot');
    expect(settled.roleAssigned).toBe(false);
  });
});
