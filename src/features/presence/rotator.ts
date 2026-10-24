import { container } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { presence } from './config.js';
import { readPotRow } from './snapshot.js';
import { buildStatuses, type Status } from './statuses.js';

async function currentStatuses(client: Client<true>, guildId: string): Promise<Status[]> {
  const now = Date.now();
  const row = readPotRow(container.db, guildId, now);
  const winner = row.lastWinnerId
    ? await client.users.fetch(row.lastWinnerId).catch(() => null)
    : null;
  return buildStatuses(
    {
      pot: row.pot,
      lastWinnerName: winner?.displayName,
      lastWonAt: row.lastWonAt,
      spinsToday: row.spinsToday,
    },
    now,
  );
}

/**
 * Shows the live pot and a few other lines as the bot's status, moving to the next one every
 * `presence.rotateEveryMs`. `guildId` picks the pot (falls back to the first cached guild).
 * Never throws; returns a function that stops the rotation.
 */
export function startPresence(client: Client<true>, guildId?: string): () => void {
  let index = 0;
  let last = '';

  const tick = async () => {
    try {
      const guild = guildId ?? client.guilds.cache.first()?.id;
      if (!guild) return;
      const statuses = await currentStatuses(client, guild);
      const status = statuses[index % statuses.length];
      index += 1;
      if (!status) return;
      const key = `${status.type}:${status.text}`;
      if (key === last) return;
      last = key;
      client.user.setPresence({
        status: 'online',
        activities: [{ name: status.text, type: status.type }],
      });
    } catch (error) {
      container.logger.warn(
        `presence: could not update status: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  };

  void tick();
  const timer = setInterval(() => void tick(), presence.rotateEveryMs);
  timer.unref();
  return () => clearInterval(timer);
}
