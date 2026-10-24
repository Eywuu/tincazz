import crypto from 'node:crypto';
import { syncBuiltinESMExports } from 'node:module';
import { Events } from 'discord.js';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';

// Sapphire loads the command with Node's native loader, so vi.mock cannot reach it. Patch the real
// crypto.randomInt instead and re-sync the builtin ESM exports so native imports see it.
function mockRandomInt(value: number) {
  vi.spyOn(crypto, 'randomInt').mockReturnValue(value as never);
  syncBuiltinESMExports();
}

const head = '<:gamba4Head:1202741378161840239>';

function buildClient() {
  return createClient({ DISCORD_TOKEN: 'x', COMMAND_PREFIX: '?', LOG_LEVEL: 'error' });
}

function makeMessage(
  client: ReturnType<typeof buildClient>,
  content: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    content,
    createdTimestamp: 1000,
    author: { bot: false, id: '1' },
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
      permissionsFor: () => ({ has: () => true }),
    },
    client,
    reply: vi.fn(async (_options: { content: string; allowedMentions: unknown }) => ({})),
    ...overrides,
  };
}

describe('?gamba', () => {
  // Sapphire keeps global state, so a second client in the same process loses its built-in
  // preconditions. Share one client across the tests in this file.
  let client: ReturnType<typeof buildClient>;

  beforeAll(async () => {
    client = buildClient();
    await client.stores.load();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    syncBuiltinESMExports();
  });

  it('replies with three reels', async () => {
    mockRandomInt(0);
    const message = makeMessage(client, '?gamba');

    client.emit(Events.MessageCreate, message as never);

    await vi.waitFor(() => expect(message.reply).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(message.reply).toHaveBeenCalledWith({
      content: `${head} ${head} ${head}`,
      allowedMentions: { repliedUser: true },
    });
    expect(message.member?.roles.add).not.toHaveBeenCalled();
  });

  it('ignores trailing text', async () => {
    mockRandomInt(0);
    const message = makeMessage(client, '?gamba lol');

    client.emit(Events.MessageCreate, message as never);

    await vi.waitFor(() => expect(message.reply).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(message.reply).toHaveBeenCalledWith({
      content: `${head} ${head} ${head}`,
      allowedMentions: { repliedUser: true },
    });
  });

  it('does nothing in DMs', async () => {
    mockRandomInt(0);
    const message = makeMessage(client, '?gamba', {
      guild: null,
      guildId: null,
      channel: { id: '3', type: 1, isDMBased: () => true, isThread: () => false },
    });

    client.emit(Events.MessageCreate, message as never);
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(message.reply).not.toHaveBeenCalled();
    expect(message.member?.roles.add).not.toHaveBeenCalled();
  });

  it('jackpot assigns the role', async () => {
    mockRandomInt(20);
    const message = makeMessage(client, '?gamba');

    client.emit(Events.MessageCreate, message as never);

    await vi.waitFor(() => expect(message.reply).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(message.member?.roles.add).toHaveBeenCalledWith('1561827731400822845', 'gamba jackpot');
    expect(message.reply.mock.calls[0]?.[0]?.content).toMatch(
      /\nJACKPOT! You won <@&1561827731400822845>$/,
    );
  });

  it('jackpot still replies when the role cannot be assigned', async () => {
    mockRandomInt(20);
    const message = makeMessage(client, '?gamba', {
      member: {
        roles: { add: vi.fn(async () => Promise.reject(new Error('Missing Permissions'))) },
      },
    });

    client.emit(Events.MessageCreate, message as never);

    await vi.waitFor(() => expect(message.reply).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(message.reply.mock.calls[0]?.[0]?.content).toMatch(
      / \(couldn't assign the role, tell a mod\)$/,
    );
  });

  it('jackpot with no cached member', async () => {
    mockRandomInt(20);
    const message = makeMessage(client, '?gamba', { member: null });

    client.emit(Events.MessageCreate, message as never);

    await vi.waitFor(() => expect(message.reply).toHaveBeenCalledTimes(1), { timeout: 2000 });
    expect(message.reply.mock.calls[0]?.[0]?.content).toMatch(
      / \(couldn't assign the role, tell a mod\)$/,
    );
  });
});
