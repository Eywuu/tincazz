import { Events } from 'discord.js';
import { beforeAll, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { testEnv } from './support/env.js';

// Sapphire keeps global state, so a second client in the same process loses its built-in
// preconditions. Share one client across the tests in this file.
let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

it('?ping replies with latency', async () => {
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

it('/ping replies with latency', async () => {
  const interaction = {
    isChatInputCommand: () => true,
    isContextMenuCommand: () => false,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    commandName: 'ping',
    commandId: '1',
    createdTimestamp: 1000,
    client,
    guildId: '2',
    channelId: '3',
    user: { id: '1' },
    reply: vi.fn(async () => ({ resource: { message: { createdTimestamp: 1042 } } })),
    editReply: vi.fn(),
  };

  client.emit(Events.InteractionCreate, interaction as never);

  await vi.waitFor(() => expect(interaction.editReply).toHaveBeenCalledTimes(1), {
    timeout: 2000,
  });
  expect(interaction.reply).toHaveBeenCalledWith({ content: 'Pinging...', withResponse: true });
  expect(interaction.editReply.mock.calls[0]?.[0]).toMatch(/^Pong! Round trip: 42ms/);
});
