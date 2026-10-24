import { container } from '@sapphire/framework';
import { Events } from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { wallets } from '../src/db/schema.js';
import { findWallet } from '../src/features/economy/index.js';
import { testEnv } from './support/env.js';
import { makeChatInput } from './support/interaction.js';

let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

beforeEach(() => {
  container.db = openDatabase(':memory:');
});

async function run(userId: string, options: Record<string, unknown> = {}) {
  const interaction = makeChatInput(client, { commandName: 'leaderboard', userId, options });
  client.emit(Events.InteractionCreate, interaction as never);
  await new Promise((resolve) => setTimeout(resolve, 100));
  return JSON.stringify(interaction.reply.mock.calls[0]);
}

describe('/leaderboard', () => {
  it('shows the coins board with the caller rank by default', async () => {
    container.db
      .insert(wallets)
      .values([
        { guildId: '2', userId: '1', balance: 500, createdAt: 0 },
        { guildId: '2', userId: '2', balance: 900, createdAt: 0 },
      ])
      .run();
    const reply = await run('1');
    expect(reply).toContain('Leaderboard · Coins');
    expect(reply).toContain('🥇 <@2> · **900**');
    expect(reply).toContain('-# Your rank: #2 · 500');
    expect(reply).toContain('lb:cat:1');
  });

  it('shows an empty board without creating a wallet', async () => {
    const reply = await run('7', { category: 'spins' });
    expect(reply).toContain('Nobody is on this board yet.');
    expect(findWallet(container.db, '2', '7')).toBeUndefined();
  });
});
