import { container } from '@sapphire/framework';
import { MessageFlags } from 'discord.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import {
  type EconomyEvent,
  economyLogCard,
  logEconomy,
  logMod,
  type ModEvent,
  modLogCard,
} from '../src/features/logs/index.js';
import { setLogChannel } from '../src/features/settings/store.js';
import { testEnv } from './support/env.js';

// Sapphire keeps global state; share one client across the tests in this file.
let client: ReturnType<typeof createClient>;
let send: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

beforeEach(() => {
  container.db = openDatabase(':memory:');
  send = vi.fn(async () => ({}));
  warn = vi.fn();
  container.logger = { warn } as unknown as typeof container.logger;
  client.channels.cache.set('50', { id: '50', isSendable: () => true, send } as never);
});

const json = (card: unknown) => JSON.stringify(card);

it('renders a card for every event type', () => {
  const economy: [EconomyEvent, string[]][] = [
    [
      {
        type: 'admin_adjust',
        actorId: '9',
        userId: '1',
        action: 'give',
        amount: 500,
        reason: 'r',
        balance: 700,
      },
      ['<@1>', '500'],
    ],
    [
      { type: 'jackpot', userId: '1', bet: 10, payout: 1234, potWon: 1000, roleAssigned: true },
      ['<@1>', '1,234'],
    ],
    [
      { type: 'big_spin', userId: '1', bet: 6000, result: 'triple', payout: 12000 },
      ['<@1>', '12,000'],
    ],
    [
      {
        type: 'big_flip',
        mode: 'challenge',
        playerIds: ['1', '2'],
        bet: 7000,
        winnerId: '1',
        rake: 70,
      },
      ['<@1>', '<@2>', '7,000'],
    ],
    [{ type: 'member_departed', userId: '1', balance: 300, purgeAt: 5000 }, ['<@1>', '300']],
    [{ type: 'member_restored', userId: '1', balance: 300 }, ['<@1>', '300']],
    [
      { type: 'reconcile_summary', departed: 1, restored: 2, purged: ['3'], coinsRemoved: 999 },
      ['<@3>', '999'],
    ],
  ];
  for (const [event, needles] of economy) {
    const out = json(economyLogCard(event, 1000));
    for (const needle of needles) expect(out, event.type).toContain(needle);
    expect(out).toContain('<t:1:f>');
  }

  const mod: [ModEvent, string[]][] = [
    [{ type: 'autorole_added', actorId: '9', roleId: '77', target: 'member' }, ['<@9>', '<@&77>']],
    [{ type: 'autorole_removed', actorId: '9', roleId: '77', target: 'bot' }, ['<@&77>']],
    [
      {
        type: 'log_channel_set',
        actorId: '9',
        kind: 'mod',
        fromChannelId: '40',
        toChannelId: '50',
      },
      ['<#40>', '<#50>'],
    ],
    [{ type: 'log_channel_cleared', actorId: '9', kind: 'mod', fromChannelId: '40' }, ['<#40>']],
    [
      { type: 'setting_auto_cleared', setting: 'autorole', id: '77', detail: 'role deleted' },
      ['role deleted'],
    ],
    [
      { type: 'autorole_failed', userId: '1', failures: [{ roleId: '77', reason: 'hierarchy' }] },
      ['<@1>', '<@&77>', 'hierarchy'],
    ],
  ];
  for (const [event, needles] of mod) {
    const out = json(modLogCard(event, 1000));
    for (const needle of needles) expect(out, event.type).toContain(needle);
  }

  const purged = Array.from({ length: 25 }, (_, i) => String(i + 100));
  const big = json(
    economyLogCard(
      { type: 'reconcile_summary', departed: 0, restored: 0, purged, coinsRemoved: 5 },
      1000,
    ),
  );
  expect(big).toContain('25');
  expect(big).not.toContain('<@');
});

const event: EconomyEvent = { type: 'member_restored', userId: '1', balance: 3 };

it('posts economy events to the economy channel', async () => {
  setLogChannel(container.db, '2', 'economy', '50', 1);
  await logEconomy('2', event);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ flags: MessageFlags.IsComponentsV2 });
});

it('posts mod events to the mod channel only', async () => {
  setLogChannel(container.db, '2', 'economy', '50', 1);
  await logMod('2', { type: 'log_channel_cleared', actorId: '9', kind: 'mod', fromChannelId: '4' });
  expect(send).not.toHaveBeenCalled();
});

it('does nothing when no channel is set', async () => {
  await logEconomy('2', event);
  expect(send).not.toHaveBeenCalled();
  expect(warn).not.toHaveBeenCalled();
});

it('warns when the channel is gone or sending throws', async () => {
  setLogChannel(container.db, '2', 'economy', '404', 1);
  vi.spyOn(client.channels, 'fetch').mockRejectedValueOnce(new Error('unknown'));
  await expect(logEconomy('2', event)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(1);

  setLogChannel(container.db, '2', 'economy', '50', 2);
  send.mockRejectedValueOnce(new Error('missing access'));
  await expect(logEconomy('2', event)).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledTimes(2);
});

it('never lets user text ping', async () => {
  setLogChannel(container.db, '2', 'economy', '50', 1);
  await logEconomy('2', {
    type: 'admin_adjust',
    actorId: '9',
    userId: '1',
    action: 'take',
    amount: 5,
    reason: '@everyone <@3>',
    balance: 0,
  });
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).not.toHaveProperty('allowedMentions');
});
