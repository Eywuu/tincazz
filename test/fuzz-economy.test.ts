import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { flipSides, flips, ledger, pots, spins, wallets } from '../src/db/schema.js';
import { settleBotFlip, settleChallenge } from '../src/features/coinflip/index.js';
import {
  adminAdjust,
  bailout,
  chatReward,
  claimBailout,
  claimDaily,
  coinsRank,
  EconomyError,
  findWallet,
  getOrCreateWallet,
  rewardChat,
  startingBalance,
  utcDay,
} from '../src/features/economy/index.js';
import { pot } from '../src/features/gamba/config.js';
import { InvalidBetError, settleSpin } from '../src/features/gamba/index.js';
import { leaderboardPage, leaderboardRank } from '../src/features/stats/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

const guilds = ['1', '2'] as const;
const users = ['3', '4', '123456789012345678'] as const;
const who = fc.record({ guildId: fc.constantFrom(...guilds), userId: fc.constantFrom(...users) });

// One draw per reel from [0, 21): 0-17 are yt emojis, 18-19 python, 20 cpp. Bias toward triples.
const reels = fc.oneof(
  fc.tuple(fc.nat({ max: 20 }), fc.nat({ max: 20 }), fc.nat({ max: 20 })),
  fc.constantFrom([0, 0, 0], [18, 18, 18], [20, 20, 20], [20, 20, 0], [18, 19, 0]),
);

const betText = fc.oneof(
  fc.integer({ min: -10, max: 20_000 }).map(String),
  fc.constantFrom('all', 'half', 'ALL', '2.5k', '10k', '0.01k', '1e3', '', ' ', '9'.repeat(30)),
  fc.string({ unit: 'binary', maxLength: 12 }),
);

const sqlPayloads = [
  "'); DROP TABLE wallets;--",
  "' OR '1'='1",
  '"; DELETE FROM ledger; --',
  '%',
  '_',
  '\\',
  "''''",
  '1; ATTACH DATABASE ":memory:" AS x; --',
  'NULL',
  '\u0000',
  'a\u0000b',
];

const reason = fc.oneof(
  fc.constantFrom(...sqlPayloads),
  fc.string({ unit: 'grapheme', maxLength: 220 }),
  fc.constant('   '),
);

const adminAmount = fc.oneof(
  fc.integer({ min: 1, max: 1_000_000 }),
  fc.integer({ min: -5, max: 1_000_005 }),
  fc.constantFrom(0, 1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 2),
);

const op = fc.oneof(
  fc.record({ kind: fc.constant('wager' as const), who, reels, bet: betText }),
  fc.record({
    kind: fc.constant('flipBot' as const),
    who,
    bet: betText,
    side: fc.constantFrom(...flipSides),
    draw: fc.constantFrom(0, 1),
  }),
  fc.record({
    kind: fc.constant('flipChallenge' as const),
    who,
    acceptorOffset: fc.integer({ min: 1, max: users.length - 1 }),
    mode: fc.constantFrom('challenge' as const, 'open' as const),
    bet: fc.integer({ min: 10, max: 10_000 }),
    side: fc.constantFrom(...flipSides),
    draw: fc.constantFrom(0, 1),
    // A small range, so repeats exercise ChallengeTakenError.
    message: fc.nat({ max: 5 }),
  }),
  fc.record({ kind: fc.constant('daily' as const), who }),
  fc.record({ kind: fc.constant('bailout' as const), who }),
  fc.record({ kind: fc.constant('chat' as const), who }),
  fc.record({
    kind: fc.constant('admin' as const),
    who,
    action: fc.constantFrom('give' as const, 'take' as const),
    amount: adminAmount,
    reason,
  }),
  fc.record({
    kind: fc.constant('wait' as const),
    ms: fc.oneof(
      fc.nat({ max: 120_000 }),
      fc.constantFrom(chatReward.cooldownMs, bailout.cooldownMs, 86_400_000),
      fc.nat({ max: 3 * 86_400_000 }),
    ),
  }),
);

type Op = typeof op extends fc.Arbitrary<infer T> ? T : never;

function draws(values: readonly number[]) {
  let index = 0;
  return () => values[index++ % values.length] as number;
}

async function apply(db: Db, step: Op, now: number): Promise<void> {
  if (step.kind === 'wait') return;
  const { guildId, userId } = step.who;
  switch (step.kind) {
    case 'wager':
      await settleSpin(db, { guildId, userId, bet: step.bet }, now, {
        assignJackpotRole: async () => true,
        randomInt: draws(step.reels),
      });
      return;
    case 'flipBot':
      settleBotFlip(
        db,
        { guildId, userId, bet: step.bet, side: step.side },
        now,
        draws([step.draw]),
      );
      return;
    case 'flipChallenge':
      settleChallenge(
        db,
        {
          guildId,
          messageId: `m${step.message}`,
          mode: step.mode,
          challengerId: userId,
          acceptorId: users[
            (users.indexOf(userId as never) + step.acceptorOffset) % users.length
          ] as string,
          bet: step.bet,
          challengerSide: step.side,
        },
        now,
        draws([step.draw]),
      );
      return;
    case 'daily':
      claimDaily(db, guildId, userId, now);
      return;
    case 'bailout':
      claimBailout(db, guildId, userId, now);
      return;
    case 'chat':
      rewardChat(db, guildId, userId, now);
      return;
    case 'admin':
      adminAdjust(db, { guildId, userId, actorId: '9', ...step, now });
      return;
  }
}

function snapshot(db: Db) {
  return {
    wallets: db.select().from(wallets).all(),
    // `start` rows belong to wallet creation, which a rejected bet may leave behind (see below).
    ledger: db
      .select()
      .from(ledger)
      .all()
      .filter((row) => row.reason !== 'start'),
    spins: db.select().from(spins).all(),
    flips: db.select().from(flips).all(),
    pots: db.select().from(pots).all(),
  };
}

/** Expected failures; anything else (a plain Error, a RangeError from the ledger) is a bug. */
function isExpectedFailure(step: Op, error: unknown): boolean {
  if (error instanceof EconomyError || error instanceof InvalidBetError) return true;
  return step.kind === 'admin' && error instanceof RangeError;
}

function expectInvariants(db: Db): void {
  expectLedgerConsistent(db);
  for (const wallet of db.select().from(wallets).all()) {
    expect(Number.isSafeInteger(wallet.balance)).toBe(true);
    expect(wallet.balance).toBeGreaterThanOrEqual(0);
  }
  for (const row of db.select().from(ledger).all()) {
    expect(Number.isSafeInteger(row.delta)).toBe(true);
    expect(row.delta).not.toBe(0);
  }
  const ledgerRows = db.select().from(ledger).all();
  for (const row of db.select().from(flips).all()) {
    expect(row.rake).toBeGreaterThanOrEqual(1);
    expect(row.rake).toBeLessThanOrEqual(row.bet);
    expect(
      ledgerRows.some((entry) => entry.reason === 'flip_bet' && entry.ref === row.id),
      'every flip has a stake row',
    ).toBe(true);
  }
  for (const row of db.select().from(pots).all()) {
    expect(row.amount).toBeGreaterThanOrEqual(pot.seed);
  }
}

/** Claims and rewards are never paid faster than their cooldowns allow. */
function expectCooldownsHeld(db: Db): void {
  const rows = db.select().from(ledger).all();
  for (const guildId of guilds) {
    for (const userId of users) {
      const mine = rows.filter((row) => row.guildId === guildId && row.userId === userId);
      const times = (reason: string) =>
        mine.filter((row) => row.reason === reason).map((row) => row.createdAt);
      const days = times('daily').map(utcDay);
      expect(new Set(days).size, 'one daily per UTC day').toBe(days.length);
      const gaps = (list: number[]) => list.slice(1).map((time, i) => time - (list[i] as number));
      for (const gap of gaps(times('bailout'))) {
        expect(gap).toBeGreaterThanOrEqual(bailout.cooldownMs);
      }
      for (const gap of gaps(times('chat'))) {
        expect(gap).toBeGreaterThanOrEqual(chatReward.cooldownMs);
      }
    }
  }
}

describe('economy fuzz', () => {
  it('keeps every wallet consistent and non-negative under random play', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 0, max: 2_000_000_000_000 }),
        fc.array(op, { minLength: 1, maxLength: 50 }),
        async (start, steps) => {
          const db = openDatabase(':memory:');
          let now = start;
          for (const step of steps) {
            if (step.kind === 'wait') {
              now += step.ms;
              continue;
            }
            const before = snapshot(db);
            const existed = findWallet(db, step.who.guildId, step.who.userId) !== undefined;
            try {
              await apply(db, step, now);
            } catch (error) {
              if (!isExpectedFailure(step, error)) throw error;
              const after = snapshot(db);
              if ((step.kind === 'wager' || step.kind === 'flipBot') && !existed) {
                // settleSpin and settleBotFlip open the wallet before reading the bet; that is all
                // they may leave. settleChallenge is fully atomic.
                const created = findWallet(db, step.who.guildId, step.who.userId);
                expect(created?.balance).toBe(startingBalance);
                after.wallets = after.wallets.filter(
                  (w) => !(w.guildId === step.who.guildId && w.userId === step.who.userId),
                );
              }
              expect(after, `a failed ${step.kind} changed nothing`).toEqual(before);
            }
            expectInvariants(db);
          }
          expectCooldownsHeld(db);
        },
      ),
      { numRuns: 200 },
    );
  });

  it('stores moderator reasons verbatim, whatever SQL they contain', () => {
    const db = openDatabase(':memory:');
    const tables = () =>
      db.$client.prepare("select name from sqlite_master where type = 'table' order by name").all();
    const before = tables();
    fc.assert(
      fc.property(
        fc.oneof(fc.constantFrom(...sqlPayloads), fc.string({ unit: 'grapheme', maxLength: 200 })),
        (text) => {
          const note = text.trim();
          fc.pre(note.length >= 1 && note.length <= 200);
          adminAdjust(db, {
            guildId: '1',
            userId: '3',
            actorId: '9',
            action: 'give',
            amount: 1,
            reason: text,
            now: 1,
          });
          const last = db.$client
            .prepare('select note from ledger order by id desc limit 1')
            .pluck()
            .get();
          expect(last).toBe(note);
        },
      ),
      { numRuns: 500 },
    );
    expect(tables()).toEqual(before);
    expectLedgerConsistent(db);
  });

  it('treats hostile guild and user ids as plain values in every query', () => {
    const hostile = fc.oneof(
      fc.constantFrom(...sqlPayloads),
      fc.string({ unit: 'grapheme', minLength: 1, maxLength: 40 }),
    );
    fc.assert(
      fc.property(hostile, hostile, (guildId, userId) => {
        const db = openDatabase(':memory:');
        const tables = db.$client.prepare("select name from sqlite_master where type = 'table'");
        const before = tables.all();
        const wallet = getOrCreateWallet(db, guildId, userId, 1);
        expect(wallet).toMatchObject({ guildId, userId, balance: startingBalance });
        expect(findWallet(db, guildId, userId)).toEqual(wallet);
        expect(coinsRank(db, guildId, userId)).toBeGreaterThanOrEqual(1);
        expect(leaderboardRank(db, guildId, 'coins', userId)?.value).toBe(startingBalance);
        const board = leaderboardPage(db, guildId, 'coins', 0);
        expect(board.rows).toEqual([{ userId, value: startingBalance, rank: 1 }]);
        expect(tables.all()).toEqual(before);
        expectLedgerConsistent(db);
      }),
      { numRuns: 300 },
    );
  });
});
