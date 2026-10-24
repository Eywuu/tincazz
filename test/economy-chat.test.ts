import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { isChatRewardable, rewardChat } from '../src/features/economy/index.js';
import { expectLedgerConsistent } from './support/ledger.js';

const base = {
  author: { bot: false },
  webhookId: null,
  system: false,
  guildId: '2',
  content: 'hi',
};

describe('isChatRewardable', () => {
  it('accepts a normal message', () => {
    expect(isChatRewardable(base, ['?'])).toBe(true);
  });

  it.each([
    ['bots', { author: { bot: true } }],
    ['webhooks', { webhookId: '5' }],
    ['system messages', { system: true }],
    ['DMs', { guildId: null }],
    ['prefix commands', { content: '?ping' }],
  ])('ignores %s', (_name, override) => {
    expect(isChatRewardable({ ...base, ...override }, ['!', '?'])).toBe(false);
  });
});

describe('rewardChat', () => {
  let db: Db;
  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('pays 5 at most once a minute', () => {
    const t = 1_000_000;
    expect(rewardChat(db, 'g', 'u', t)).toEqual({ amount: 5, balance: 1_005 });
    expect(rewardChat(db, 'g', 'u', t + 59_999)).toBeNull();
    expect(rewardChat(db, 'g', 'u', t + 60_000)).toEqual({ amount: 5, balance: 1_010 });
    expectLedgerConsistent(db);
  });

  it('writes nothing while on cooldown', () => {
    rewardChat(db, 'g', 'u', 1_000_000);
    const before = db.$client.prepare('select count(*) from ledger').pluck().get();
    rewardChat(db, 'g', 'u', 1_000_001);
    expect(db.$client.prepare('select count(*) from ledger').pluck().get()).toBe(before);
  });
});
