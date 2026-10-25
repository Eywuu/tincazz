import { container } from '@sapphire/framework';
import {
  ChannelType,
  Events,
  MessageFlags,
  PermissionFlagsBits,
  PermissionsBitField,
} from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { logChannelAlreadySet, settingsNeedsManageServer } from '../src/features/settings/cards.js';
import { logChannelId, setLogChannel } from '../src/features/settings/store.js';
import { testEnv } from './support/env.js';
import { makeChatInput, makeMe } from './support/interaction.js';

let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

beforeEach(() => {
  container.db = openDatabase(':memory:');
  container.logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never;
});

function fakeChannel(id: string, bits: bigint = PermissionsBitField.All) {
  return {
    id,
    type: ChannelType.GuildText,
    isSendable: () => true,
    permissionsFor: () => new PermissionsBitField(bits),
    send: vi.fn(async () => ({})),
  };
}

async function run(
  group: string | undefined,
  sub: string,
  options: Record<string, unknown> = {},
  extras: { permissions?: bigint; guild?: unknown } = {},
) {
  const interaction = makeChatInput(client, {
    commandName: 'settings',
    userId: '9',
    subcommand: sub,
    subcommandGroup: group,
    options,
    ...extras,
  });
  client.emit(Events.InteractionCreate, interaction as never);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const [reply] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
  return { text: JSON.stringify(reply), flags: reply.flags };
}

describe('/settings logs', () => {
  it('refuses without Manage Server', async () => {
    const result = await run(
      'logs',
      'set',
      { type: 'economy', channel: fakeChannel('50') },
      { permissions: PermissionFlagsBits.SendMessages },
    );
    expect(result.text).toContain(settingsNeedsManageServer);
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
  });

  it('sets the economy log after posting a confirmation there', async () => {
    const channel = fakeChannel('50');
    const result = await run('logs', 'set', { type: 'economy', channel });
    expect(JSON.stringify(channel.send.mock.calls[0])).toContain(
      'This channel now receives economy logs',
    );
    expect(logChannelId(container.db, '2', 'economy')).toBe('50');
    expect(result.text).toContain('Set the economy log to <#50>.');
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
  });

  it('rejects a channel it cannot post in', async () => {
    const channel = fakeChannel('50', 0n);
    const result = await run('logs', 'set', { type: 'economy', channel });
    expect(result.text).toContain('I need View Channel and Send Messages');
    expect(logChannelId(container.db, '2', 'economy')).toBeUndefined();
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('changes nothing when the confirmation fails', async () => {
    const channel = fakeChannel('50');
    channel.send.mockRejectedValue(new Error('nope'));
    const result = await run('logs', 'set', { type: 'economy', channel });
    expect(result.text).toContain("I couldn't post in <#50>, so nothing changed.");
    expect(logChannelId(container.db, '2', 'economy')).toBeUndefined();
  });

  it('says so when the channel is already set', async () => {
    setLogChannel(container.db, '2', 'economy', '50', 1);
    const channel = fakeChannel('50');
    const result = await run('logs', 'set', { type: 'economy', channel });
    expect(result.text).toContain(logChannelAlreadySet('economy', '50'));
    expect(channel.send).not.toHaveBeenCalled();
  });

  it('tells the old mod log when the mod log moves', async () => {
    setLogChannel(container.db, '2', 'mod', '60', 1);
    const old = fakeChannel('60');
    client.channels.cache.set('60', old as never);
    const channel = fakeChannel('50');
    client.channels.cache.set('50', channel as never);
    await run('logs', 'set', { type: 'mod', channel });
    expect(logChannelId(container.db, '2', 'mod')).toBe('50');
    expect(old.send).toHaveBeenCalled();
    expect(channel.send).toHaveBeenCalled();
  });

  it('clears a log', async () => {
    setLogChannel(container.db, '2', 'economy', '50', 1);
    const result = await run('logs', 'clear', { type: 'economy' });
    expect(result.text).toContain('Cleared the economy log.');
    expect(logChannelId(container.db, '2', 'economy')).toBeUndefined();
  });

  it('explains clearing an unset log', async () => {
    const result = await run('logs', 'clear', { type: 'mod' });
    expect(result.text).toContain("The mod log isn't set.");
  });

  it('shows log settings with warnings', async () => {
    setLogChannel(container.db, '2', 'economy', '77', 1);
    const result = await run(undefined, 'show');
    expect(result.text).toContain('**Economy log:**');
    expect(result.text).toContain('⚠️ channel no longer exists');
    expect(result.text).toContain('**Mod log:** not set');
    expect(result.text).toContain('**Auto-roles (members):** none');
  });

  it('shows a healthy log channel without warning', async () => {
    setLogChannel(container.db, '2', 'mod', '50', 1);
    const guild = {
      id: '2',
      ownerId: '0',
      channels: { cache: new Map([['50', fakeChannel('50')]]) },
      roles: { cache: new Map() },
      members: { me: makeMe() },
    };
    const result = await run(undefined, 'show', {}, { guild });
    expect(result.text).toContain('**Mod log:** <#50>');
    expect(result.text).not.toContain('⚠️');
  });
});
