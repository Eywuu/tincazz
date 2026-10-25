import { container } from '@sapphire/framework';
import { Events, MessageFlags, PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import {
  botsHaveNoWallets,
  ecoNeedsManageServer,
  ecoNeedsReason,
  ecoNotAMember,
} from '../src/features/economy/cards.js';
import { adminAdjust, findWallet } from '../src/features/economy/index.js';
import { setLogChannel } from '../src/features/settings/store.js';
import { testEnv } from './support/env.js';
import { makeChatInput, makeUser } from './support/interaction.js';

let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

beforeEach(() => {
  container.db = openDatabase(':memory:');
});

async function run(
  subcommand: string,
  options: Record<string, unknown>,
  permissions?: bigint,
  absentMembers?: string[],
) {
  const interaction = makeChatInput(client, {
    commandName: 'eco',
    userId: '9',
    subcommand,
    options,
    permissions,
    absentMembers,
  });
  client.emit(Events.InteractionCreate, interaction as never);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const [reply] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
  return { text: JSON.stringify(reply), flags: reply.flags };
}

describe('/eco', () => {
  it('refuses a member who left', async () => {
    const result = await run('give', { user: makeUser('1'), amount: 5, reason: 'x' }, undefined, [
      '1',
    ]);
    expect(result.text).toContain(ecoNotAMember('1'));
    expect(findWallet(container.db, '2', '1')).toBeUndefined();
  });

  it('gives coins with an ephemeral card', async () => {
    const result = await run('give', { user: makeUser('1'), amount: 500, reason: 'event' });
    expect(result.text).toContain('Gave **500** coins to <@1>. New balance: 1,500.');
    expect(result.text).toContain('Reason: event');
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
  });

  it('posts an admin_adjust card to the economy log channel', async () => {
    const send = vi.fn(async () => ({}));
    client.channels.cache.set('50', { id: '50', isSendable: () => true, send } as never);
    setLogChannel(container.db, '2', 'economy', '50', 1);

    await run('give', { user: makeUser('1'), amount: 500, reason: 'event' });

    await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));
    const text = JSON.stringify(send.mock.calls[0]);
    expect(text).toContain('<@1>');
    expect(text).toContain('500');
    expect(text).toContain('event');
  });

  it('explains insufficient funds', async () => {
    adminAdjust(container.db, {
      guildId: '2',
      userId: '1',
      actorId: '9',
      action: 'take',
      amount: 700,
      reason: 'setup',
      now: 1,
    });
    const result = await run('take', { user: makeUser('1'), amount: 400, reason: 'x' });
    expect(result.text).toContain('<@1> only has 300 coins.');
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
  });

  it('rejects a bot target', async () => {
    const result = await run('give', { user: makeUser('7', true), amount: 5, reason: 'x' });
    expect(result.text).toContain(botsHaveNoWallets);
    expect(findWallet(container.db, '2', '7')).toBeUndefined();
  });

  it('refuses a member without Manage Server even if the command is visible to them', async () => {
    const result = await run(
      'give',
      { user: makeUser('1'), amount: 500, reason: 'event' },
      PermissionFlagsBits.SendMessages | PermissionFlagsBits.ManageMessages,
    );
    expect(result.text).toContain(ecoNeedsManageServer);
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
    expect(findWallet(container.db, '2', '1')).toBeUndefined();
  });

  it('asks for a reason when it is only whitespace', async () => {
    const result = await run('give', { user: makeUser('1'), amount: 500, reason: ' \t ' });
    expect(result.text).toContain(ecoNeedsReason);
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
    expect(findWallet(container.db, '2', '1')).toBeUndefined();
  });

  it('requires Manage Server', () => {
    const command = client.stores.get('commands').get('eco') as unknown as {
      registerApplicationCommands(registry: {
        registerChatInputCommand(build: (b: never) => unknown): void;
      }): void;
    };
    let data: { default_member_permissions?: string | null } | undefined;
    command.registerApplicationCommands({
      registerChatInputCommand: (build) => {
        data = (build(new SlashCommandBuilder() as never) as { toJSON(): typeof data }).toJSON();
      },
    });
    expect(data?.default_member_permissions).toBe(PermissionFlagsBits.ManageGuild.toString());
  });
});
