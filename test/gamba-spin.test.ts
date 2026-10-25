import { container } from '@sapphire/framework';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { type Db, openDatabase } from '../src/db/index.js';
import { pots, spins } from '../src/db/schema.js';
import {
  debit,
  findWallet,
  getOrCreateWallet,
  InsufficientFundsError,
  startingBalance,
} from '../src/features/economy/index.js';
import { InvalidBetError } from '../src/features/gamba/index.js';
import { settleSpin, spin } from '../src/features/gamba/spin.js';
import { setLogChannel } from '../src/features/settings/store.js';
import { testEnv } from './support/env.js';

function draws(...values: number[]) {
  const queue = [...values];
  return () => queue.shift() ?? 0;
}

const json = (value: unknown) => JSON.stringify(value);

// Sapphire keeps global state; one client for the file also gives the log sender its logger.
beforeAll(() => {
  createClient(testEnv);
});

describe('spin', () => {
  let db: Db;
  const request = { guildId: '2', userId: '1' };

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('plays a 10-coin wager when no bet is given', async () => {
    const { played } = await settleSpin(db, request, 1000, {
      assignJackpotRole: async () => true,
      randomInt: draws(0, 3, 6),
    });

    expect(played.bet).toBe(10);
    expect(findWallet(db, '2', '1')?.balance).toBe(startingBalance - 10);
  });

  it('rejects a no-bet spin under 10 coins with a funds error', async () => {
    getOrCreateWallet(db, '2', '1', 1000);
    debit(db, { guildId: '2', userId: '1', amount: startingBalance - 9, reason: 'bet', now: 1000 });

    await expect(
      settleSpin(db, request, 1000, { assignJackpotRole: async () => true }),
    ).rejects.toBeInstanceOf(InsufficientFundsError);
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

describe('spin economy log', () => {
  let send: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    container.db = openDatabase(':memory:');
    send = vi.fn(async () => ({}));
    container.client.channels.cache.set('50', {
      id: '50',
      isSendable: () => true,
      send,
    } as never);
    setLogChannel(container.db, '2', 'economy', '50', 1);
  });

  it('logs a jackpot once', async () => {
    await spin(container.db, { guildId: '2', userId: '1', bet: '500' }, 1000, {
      assignJackpotRole: async () => true,
      randomInt: draws(20, 20, 20),
    });
    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
  });

  it('does not log a 10-coin spin', async () => {
    await spin(container.db, { guildId: '2', userId: '1' }, 1000, {
      assignJackpotRole: async () => true,
      randomInt: draws(0, 3, 6),
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(send).not.toHaveBeenCalled();
  });
});
