import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { settleBotFlip, settleChallenge } from '../src/features/coinflip/index.js';
import { settleRoll } from '../src/features/dice/index.js';
import { recentPlays } from '../src/features/stats/index.js';

let db: Db;

const heads = () => 0;
const tails = () => 1;

/** Draws one then another: die1 = a + 1, die2 = b + 1. */
const dice = (a: number, b: number) => {
  const queue = [a, b];
  return () => queue.shift() ?? 0;
};

const flip = (userId: string, side: 'heads' | 'tails', bet: string, now: number, draw = heads) =>
  settleBotFlip(db, { guildId: 'g', userId, side, bet }, now, draw);

const challenge = (messageId: string, now: number, draw = heads) =>
  settleChallenge(
    db,
    {
      guildId: 'g',
      messageId,
      mode: 'challenge',
      challengerId: 'a',
      acceptorId: 'b',
      bet: 100,
      challengerSide: 'heads',
    },
    now,
    draw,
  );

beforeEach(() => {
  db = openDatabase(':memory:');
});

describe('recentPlays', () => {
  it('is empty for a player with no plays', () => {
    expect(recentPlays(db, 'g', 'a')).toEqual([]);
  });

  it('nets a bot flip: a win is the stake minus rake, a loss is the stake', () => {
    flip('a', 'heads', '100', 1, heads);
    flip('a', 'heads', '100', 2, tails);
    expect(recentPlays(db, 'g', 'a')).toEqual([
      { kind: 'flip', at: 2, net: -100, result: 'tails' },
      { kind: 'flip', at: 1, net: 94, result: 'heads' },
    ]);
  });

  it('nets a challenge for both players and names the other one', () => {
    challenge('m1', 5, tails); // b wins: credited 194, net 94
    expect(recentPlays(db, 'g', 'a')).toEqual([
      { kind: 'flip', at: 5, net: -100, result: 'tails', opponentId: 'b' },
    ]);
    expect(recentPlays(db, 'g', 'b')).toEqual([
      { kind: 'flip', at: 5, net: 94, result: 'tails', opponentId: 'a' },
    ]);
  });

  it('nets a roll as payout minus bet', () => {
    settleRoll(
      db,
      { guildId: 'g', userId: 'a', bet: '100', call: { kind: 'high' } },
      1,
      dice(5, 2),
    );
    settleRoll(
      db,
      { guildId: 'g', userId: 'a', bet: '100', call: { kind: 'high' } },
      2,
      dice(0, 0),
    );
    const [lost, won] = recentPlays(db, 'g', 'a');
    expect(lost).toEqual({
      kind: 'roll',
      at: 2,
      net: -100,
      die1: 1,
      die2: 1,
      call: { kind: 'high' },
    });
    expect(won).toMatchObject({ kind: 'roll', at: 1, die1: 6, die2: 3, call: { kind: 'high' } });
    expect((won as { net: number }).net).toBeGreaterThan(0);
  });

  it('restores an exact call target', () => {
    settleRoll(
      db,
      { guildId: 'g', userId: 'a', bet: '10', call: { kind: 'exact', target: 9 } },
      1,
      dice(5, 2),
    );
    expect(recentPlays(db, 'g', 'a')[0]).toMatchObject({ call: { kind: 'exact', target: 9 } });
  });

  it('merges flips (as challenger or opponent) and rolls, newest first, capped at 5', () => {
    flip('a', 'heads', '10', 1);
    challenge('m1', 2); // a as challenger
    settleChallenge(
      db,
      {
        guildId: 'g',
        messageId: 'm2',
        mode: 'challenge',
        challengerId: 'b',
        acceptorId: 'a',
        bet: 10,
        challengerSide: 'heads',
      },
      4,
      heads,
    ); // a as opponent
    settleRoll(db, { guildId: 'g', userId: 'a', bet: '10', call: { kind: 'low' } }, 3, dice(0, 0));
    settleRoll(db, { guildId: 'g', userId: 'a', bet: '10', call: { kind: 'low' } }, 5, dice(0, 0));
    flip('a', 'tails', '10', 6, tails);
    expect(recentPlays(db, 'g', 'a').map((p) => [p.kind, p.at])).toEqual([
      ['flip', 6],
      ['roll', 5],
      ['flip', 4],
      ['roll', 3],
      ['flip', 2],
    ]);
    expect(recentPlays(db, 'g', 'a', 2)).toHaveLength(2);
  });

  it('breaks ties on the same timestamp by newest row first', () => {
    flip('a', 'heads', '10', 7, heads);
    flip('a', 'heads', '20', 7, tails);
    expect(recentPlays(db, 'g', 'a').map((p) => p.net)).toEqual([-20, 9]);
  });

  it("ignores other players' and other guilds' plays", () => {
    flip('b', 'heads', '10', 1);
    settleBotFlip(db, { guildId: 'h', userId: 'a', side: 'heads', bet: '10' }, 1, heads);
    expect(recentPlays(db, 'g', 'a')).toEqual([]);
  });
});
