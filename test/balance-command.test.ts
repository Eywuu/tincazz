import { container } from '@sapphire/framework';
import { Events, MessageFlags } from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { botsHaveNoWallets } from '../src/features/economy/cards.js';
import { findWallet } from '../src/features/economy/index.js';
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

const json = (call: unknown) => JSON.stringify(call);

describe('/balance', () => {
  it('creates the caller wallet and shows it', async () => {
    const interaction = makeChatInput(client, { commandName: 'balance', userId: '1' });
    client.emit(Events.InteractionCreate, interaction as never);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const reply = json(interaction.reply.mock.calls[0]);
    expect(reply).toContain('<@1> has **1,000** coins');
    expect(reply).toContain('Rank #1 by coins');
    expect(findWallet(container.db, '2', '1')?.balance).toBe(1000);
  });

  it('does not create a wallet for another human', async () => {
    const interaction = makeChatInput(client, {
      commandName: 'balance',
      userId: '1',
      options: { user: makeUser('5') },
    });
    client.emit(Events.InteractionCreate, interaction as never);
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(json(interaction.reply.mock.calls[0])).toContain("<@5> hasn't played yet.");
    expect(findWallet(container.db, '2', '5')).toBeUndefined();
  });

  it('rejects a bot and creates nothing', async () => {
    const interaction = makeChatInput(client, {
      commandName: 'balance',
      userId: '1',
      options: { user: makeUser('7', true) },
    });
    client.emit(Events.InteractionCreate, interaction as never);
    await new Promise((resolve) => setTimeout(resolve, 100));
    const [options] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
    expect(json(options)).toContain(botsHaveNoWallets);
    expect(options.flags & MessageFlags.Ephemeral).toBeTruthy();
    expect(findWallet(container.db, '2', '7')).toBeUndefined();
    expect(findWallet(container.db, '2', '1')).toBeUndefined();
  });
});
