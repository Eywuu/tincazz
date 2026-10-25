import { container } from '@sapphire/framework';
import type { Client } from 'discord.js';
import type { Job } from '../scheduler/runner.js';
import { reconcileGuild } from './reconcile.js';

export function createMemberReconcileJob(guildId?: string): Job {
  return {
    name: 'member-reconcile',
    everyMs: 86_400_000,
    async run(client: Client<true>, now: number): Promise<boolean> {
      const ids = guildId ? [guildId] : [...client.guilds.cache.keys()];
      let ok = true;
      for (const id of ids) {
        try {
          const guild = client.guilds.cache.get(id);
          if (!guild) {
            container.logger.warn(`reconcile: guild ${id} is not cached`);
            ok = false;
            continue;
          }
          if (!(await reconcileGuild(container.db, guild, now))) ok = false;
        } catch (error) {
          container.logger.warn(`reconcile: guild ${id} failed`, error);
          ok = false;
        }
      }
      return ok;
    },
  };
}
