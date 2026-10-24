import { Events } from 'discord.js';
import { expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';

it('?ping replies with latency', async () => {
  const client = createClient({ DISCORD_TOKEN: 'x', COMMAND_PREFIX: '?', LOG_LEVEL: 'error' });
  await client.stores.load();
  const edit = vi.fn();
  const message = {
    content: '?ping',
    createdTimestamp: 1000,
    author: { bot: false, id: '1' },
    webhookId: null,
    system: false,
    guild: { id: '2', members: { me: { id: '9' }, fetchMe: async () => ({ id: '9' }) } },
    guildId: '2',
    channel: {
      id: '3',
      type: 0,
      isDMBased: () => false,
      isThread: () => false,
      permissionsFor: () => ({ has: () => true }),
    },
    client,
    reply: vi.fn(async () => ({ createdTimestamp: 1042, edit })),
  };
  client.emit(Events.MessageCreate, message as never);
  await vi.waitFor(() => expect(edit).toHaveBeenCalledTimes(1), { timeout: 2000 });
  expect(message.reply).toHaveBeenCalledWith('Pinging...');
  expect(edit.mock.calls[0]?.[0]).toMatch(/^Pong! Round trip: 42ms/);
});
