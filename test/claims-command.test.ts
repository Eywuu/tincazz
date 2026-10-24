import { container } from '@sapphire/framework';
import { Events, MessageFlags } from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
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

async function run(commandName: string) {
  const interaction = makeChatInput(client, { commandName, userId: '1' });
  client.emit(Events.InteractionCreate, interaction as never);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const [options] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
  return { text: JSON.stringify(options), flags: options.flags };
}

describe('claim commands', () => {
  it('/daily replies with a card, a second claim is ephemeral', async () => {
    const first = await run('daily');
    expect(first.text).toContain('+250 coins');
    expect(first.flags & MessageFlags.IsComponentsV2).toBeTruthy();
    expect(first.flags & MessageFlags.Ephemeral).toBeFalsy();

    const second = await run('daily');
    expect(second.text).toContain("You already claimed today's daily. Next claim <t:");
    expect(second.flags & MessageFlags.Ephemeral).toBeTruthy();
  });

  it('/bailout at 1,000 coins is not eligible', async () => {
    await run('balance');
    const result = await run('bailout');
    expect(result.text).toContain('Bailout is only for balances under 10 coins. You have 1,000.');
    expect(result.flags & MessageFlags.Ephemeral).toBeTruthy();
  });
});
