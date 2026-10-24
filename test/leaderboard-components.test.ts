import { container } from '@sapphire/framework';
import { Events, MessageFlags } from 'discord.js';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { playerStats } from '../src/db/schema.js';
import { notYourLeaderboard } from '../src/features/stats/index.js';
import { testEnv } from './support/env.js';
import { makeButton, makeSelect } from './support/interaction.js';

let client: ReturnType<typeof createClient>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

beforeEach(() => {
  container.db = openDatabase(':memory:');
  container.db
    .insert(playerStats)
    .values(
      Array.from({ length: 25 }, (_, i) => ({
        guildId: '2',
        userId: String(101 + i),
        spins: 25 - i,
      })),
    )
    .run();
});

const json = (value: unknown) => JSON.stringify(value);
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function click(interaction: ReturnType<typeof makeButton | typeof makeSelect>) {
  client.emit(Events.InteractionCreate, interaction as never);
  await wait(100);
}

describe('leaderboard components', () => {
  it('moves the owner to the next page in place', async () => {
    const interaction = makeButton(client, { customId: 'lb:page:1:spins:1', userId: '1' });
    await click(interaction);
    expect(interaction.reply).not.toHaveBeenCalled();
    const update = json(interaction.update.mock.calls[0]);
    expect(update).toContain('**11.**');
    expect(update).toContain('Page 2 of 3');
  });

  it('clamps a page that no longer exists to the last one', async () => {
    const interaction = makeButton(client, { customId: 'lb:page:1:spins:9', userId: '1' });
    await click(interaction);
    expect(json(interaction.update.mock.calls[0])).toContain('Page 3 of 3');
  });

  it('switches category from the select', async () => {
    const interaction = makeSelect(client, {
      customId: 'lb:cat:1',
      userId: '1',
      values: ['profit'],
    });
    await click(interaction);
    const update = json(interaction.update.mock.calls[0]);
    expect(update).toContain('Leaderboard · Profit');
    expect(update).toContain('Nobody is on this board yet.');
  });

  it('tells someone else the board is not theirs', async () => {
    const interaction = makeButton(client, { customId: 'lb:page:1:spins:1', userId: '5' });
    await click(interaction);
    const [options] = interaction.reply.mock.calls[0] as unknown as [{ flags: number }];
    expect(json(options)).toContain(notYourLeaderboard);
    expect(options.flags & MessageFlags.Ephemeral).toBeTruthy();
    expect(interaction.update).not.toHaveBeenCalled();
  });

  it('ignores tampered and foreign interactions', async () => {
    const ignored = [
      makeButton(client, { customId: 'lb:page:1:gold:0', userId: '1' }),
      makeButton(client, { customId: 'lb:cat:1', userId: '1' }),
      makeSelect(client, { customId: 'lb:cat:1', userId: '1', values: ['gold'] }),
      makeSelect(client, { customId: 'lb:page:1:spins:0', userId: '1', values: ['spins'] }),
      makeButton(client, { customId: 'lb:page:abc:spins:0', userId: '1' }),
    ];
    for (const interaction of ignored) {
      await click(interaction);
      expect(interaction.reply).not.toHaveBeenCalled();
      expect(interaction.update).not.toHaveBeenCalled();
    }
  });
});
