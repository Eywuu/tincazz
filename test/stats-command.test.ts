import { container } from '@sapphire/framework';
import { Events, MessageFlags } from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { settleBotFlip } from '../src/features/coinflip/index.js';
import { botsHaveNoWallets, findWallet } from '../src/features/economy/index.js';
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

async function run(options: Record<string, unknown> = {}) {
  const interaction = makeChatInput(client, { commandName: 'stats', userId: '1', options });
  client.emit(Events.InteractionCreate, interaction as never);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return interaction;
}

describe('/stats', () => {
  it('creates the caller wallet and shows the profile with the avatar', async () => {
    const interaction = await run();
    expect(interaction.reply).toHaveBeenCalledTimes(1);
    const reply = json(interaction.reply.mock.calls[0]);
    expect(reply).toContain('<@1> · **1,000** coins · rank #1');
    expect(reply).toContain('https://cdn.example/1.png');
    expect(findWallet(container.db, '2', '1')?.balance).toBe(1000);
  });

  it('does not create a wallet for another human', async () => {
    const interaction = await run({ user: makeUser('5') });
    expect(json(interaction.reply.mock.calls[0])).toContain("<@5> hasn't played yet.");
    expect(findWallet(container.db, '2', '5')).toBeUndefined();
  });

  it('shows recent plays without allowing any mentions', async () => {
    settleBotFlip(
      container.db,
      { guildId: '2', userId: '1', side: 'heads', bet: '100' },
      1_700_000_000_000,
      () => 1,
    );
    const interaction = await run();
    const [options] = interaction.reply.mock.calls[0] as unknown as [
      { allowedMentions?: { users?: string[] } },
    ];
    const reply = json(options);
    expect(reply).toContain('### Recent');
    expect(reply).toContain('🪙 Tails · -100 · <t:1700000000:R>');
    expect(options.allowedMentions?.users ?? []).toEqual([]);
  });

  it('has no recent block for a player with no plays', async () => {
    const interaction = await run();
    expect(json(interaction.reply.mock.calls[0])).not.toContain('### Recent');
  });

  it('rejects a bot privately', async () => {
    const interaction = await run({ user: makeUser('6', true) });
    const [options] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
    expect(json(options)).toContain(botsHaveNoWallets);
    expect(options.flags & MessageFlags.Ephemeral).toBeTruthy();
  });
});
