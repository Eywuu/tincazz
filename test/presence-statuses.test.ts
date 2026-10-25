import { ActivityType } from 'discord.js';
import { describe, expect, it } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { pots, spins, wallets } from '../src/db/schema.js';
import { pot } from '../src/features/gamba/config.js';
import { ago, buildStatuses, readPotRow } from '../src/features/presence/index.js';

const now = Date.UTC(2026, 9, 24, 15, 0, 0);

describe('ago', () => {
  it('uses the largest whole unit', () => {
    expect(ago(now - 30_000, now)).toBe('just now');
    expect(ago(now - 5 * 60_000, now)).toBe('5m ago');
    expect(ago(now - 3 * 3_600_000, now)).toBe('3h ago');
    expect(ago(now - 2 * 86_400_000, now)).toBe('2d ago');
    expect(ago(now + 10_000, now)).toBe('just now');
  });
});

describe('buildStatuses', () => {
  it('shows the pot and the gamba hint when there is nothing else', () => {
    expect(buildStatuses({ pot: 12_450, spinsToday: 0 }, now)).toEqual([
      { type: ActivityType.Watching, text: 'the pot: 12,450 coins' },
      { type: ActivityType.Playing, text: '/gamba to win the pot' },
    ]);
  });

  it('adds the last winner and the spin count when known', () => {
    const texts = buildStatuses(
      { pot: 10_000, lastWinnerName: 'cazz', lastWonAt: now - 3 * 3_600_000, spinsToday: 1 },
      now,
    ).map((status) => status.text);
    expect(texts).toContain('cazz hit the jackpot 3h ago');
    expect(texts).toContain('1 spin today');
  });

  it('pluralizes spins', () => {
    const texts = buildStatuses({ pot: 1, spinsToday: 1_200 }, now).map((s) => s.text);
    expect(texts).toContain('1,200 spins today');
  });

  it('leaves out the winner line without a winner name', () => {
    const statuses = buildStatuses({ pot: 1, lastWonAt: now, spinsToday: 0 }, now);
    expect(statuses.some((status) => status.text.includes('jackpot'))).toBe(false);
  });
});

describe('readPotRow', () => {
  it('falls back to the seed for a guild with no pot', () => {
    const db = openDatabase(':memory:');
    expect(readPotRow(db, '1', now)).toEqual({
      pot: pot.seed,
      lastWinnerId: undefined,
      lastWonAt: undefined,
      spinsToday: 0,
    });
  });

  it("reads the pot, winner and only today's spins for the guild", () => {
    const db = openDatabase(':memory:');
    db.insert(wallets).values({ guildId: '1', userId: '7', balance: 1, createdAt: 0 }).run();
    db.insert(pots).values({ guildId: '1', amount: 12_000, lastWinnerId: '7', lastWonAt: 5 }).run();
    const spin = { userId: '7', mode: 'wager', reels: 'a', result: 'none', bet: 1 } as const;
    const startOfDay = Date.UTC(2026, 9, 24);
    db.insert(spins)
      .values([
        { ...spin, guildId: '1', createdAt: startOfDay },
        { ...spin, guildId: '1', createdAt: startOfDay - 1 },
        { ...spin, guildId: '2', createdAt: startOfDay },
      ])
      .run();
    expect(readPotRow(db, '1', now)).toEqual({
      pot: 12_000,
      lastWinnerId: '7',
      lastWonAt: 5,
      spinsToday: 1,
    });
  });
});

describe('readPotRow departed winner', () => {
  it('hides a departed last winner', () => {
    const db = openDatabase(':memory:');
    db.insert(wallets).values({ guildId: '2', userId: '1', balance: 1, createdAt: 0 }).run();
    db.insert(pots).values({ guildId: '2', amount: 5, lastWinnerId: '1', lastWonAt: 7 }).run();
    expect(readPotRow(db, '2', now).lastWinnerId).toBe('1');
    db.update(wallets).set({ departedAt: 1 }).run();
    const row = readPotRow(db, '2', now);
    expect(row.lastWinnerId).toBeUndefined();
    expect(row.lastWonAt).toBeUndefined();
  });
});
