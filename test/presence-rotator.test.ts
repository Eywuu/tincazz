import { container } from '@sapphire/framework';
import { ActivityType } from 'discord.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { pots } from '../src/db/schema.js';
import { presence, startPresence } from '../src/features/presence/index.js';

function stubClient() {
  const setPresence = vi.fn();
  const client = {
    user: { setPresence },
    users: { fetch: vi.fn().mockRejectedValue(new Error('unknown user')) },
    guilds: { cache: { first: () => ({ id: '1' }) } },
  };
  return { client: client as never, setPresence };
}

beforeEach(() => {
  vi.useFakeTimers();
  container.logger = { warn: vi.fn() } as never;
  container.db = openDatabase(':memory:');
  container.db.insert(pots).values({ guildId: '1', amount: 12_450 }).run();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('startPresence', () => {
  it('shows the pot right away', async () => {
    const { client, setPresence } = stubClient();
    const stop = startPresence(client);
    await vi.advanceTimersByTimeAsync(0);
    expect(setPresence).toHaveBeenCalledWith({
      status: 'online',
      activities: [{ name: 'the pot: 12,450 coins', type: ActivityType.Watching }],
    });
    stop();
  });

  it('moves to the next status on every interval', async () => {
    const { client, setPresence } = stubClient();
    const stop = startPresence(client);
    await vi.advanceTimersByTimeAsync(presence.rotateEveryMs);
    expect(setPresence).toHaveBeenLastCalledWith({
      status: 'online',
      activities: [{ name: '/gamba to win the pot', type: ActivityType.Playing }],
    });
    stop();
  });

  it('stops rotating once stopped', async () => {
    const { client, setPresence } = stubClient();
    const stop = startPresence(client);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    setPresence.mockClear();
    await vi.advanceTimersByTimeAsync(presence.rotateEveryMs * 3);
    expect(setPresence).not.toHaveBeenCalled();
  });

  it('survives a failing update', async () => {
    const { client, setPresence } = stubClient();
    setPresence.mockImplementation(() => {
      throw new Error('gateway down');
    });
    const stop = startPresence(client);
    await vi.advanceTimersByTimeAsync(presence.rotateEveryMs);
    expect(container.logger.warn).toHaveBeenCalledWith(expect.stringContaining('gateway down'));
    stop();
  });
});
