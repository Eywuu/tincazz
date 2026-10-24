import { container, Events as SapphireEvents } from '@sapphire/framework';
import { Events } from 'discord.js';
import fc from 'fast-check';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { findWallet } from '../src/features/economy/index.js';
import { testEnv } from './support/env.js';

function makeMessage(client: ReturnType<typeof createClient>, content: string) {
  const followUp = vi.fn(async (_options: Record<string, unknown>) => ({}));
  return {
    content,
    createdTimestamp: 1000,
    author: { bot: false, id: '1', toString: () => '<@1>' },
    webhookId: null,
    system: false,
    guild: { id: '2', members: { me: { id: '9' }, fetchMe: async () => ({ id: '9' }) } },
    guildId: '2',
    member: { roles: { add: vi.fn(async () => undefined) } },
    channel: {
      id: '3',
      type: 0,
      isDMBased: () => false,
      isThread: () => false,
      isSendable: () => true,
      permissionsFor: () => ({ has: () => true }),
    },
    client,
    reply: vi.fn(async (_options: string | Record<string, unknown>) => ({ reply: followUp })),
  };
}

const betArgument = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 60 }),
  fc.constantFrom('100', 'all', 'half', '2.5k', '"10"', "'10'", '10 20', '-- 10', '\n10', '`'),
);

describe('?gamba fuzz', () => {
  let client: ReturnType<typeof createClient>;

  beforeAll(async () => {
    client = createClient(testEnv);
    await client.stores.load();
  });

  it('answers any bet argument with exactly one reply and no command error', async () => {
    const commandErrors = vi.fn();
    client.on(SapphireEvents.MessageCommandError, commandErrors);
    try {
      await fc.assert(
        fc.asyncProperty(betArgument, async (argument) => {
          container.db = openDatabase(':memory:');
          const message = makeMessage(client, `?gamba ${argument}`);
          client.emit(Events.MessageCreate, message as never);
          await vi.waitFor(() => expect(message.reply).toHaveBeenCalledTimes(1), {
            timeout: 2000,
          });
          await new Promise((resolve) => setTimeout(resolve, 10));
          expect(message.reply).toHaveBeenCalledTimes(1);
          expect(commandErrors).not.toHaveBeenCalled();
          const balance = findWallet(container.db, '2', '1')?.balance;
          expect(Number.isSafeInteger(balance)).toBe(true);
          expect(balance).toBeGreaterThanOrEqual(0);
        }),
        { numRuns: 50 },
      );
    } finally {
      client.off(SapphireEvents.MessageCommandError, commandErrors);
    }
  });
});
