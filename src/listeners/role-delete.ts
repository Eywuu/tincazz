import { Events, Listener } from '@sapphire/framework';
import type { Role } from 'discord.js';
import { logMod } from '../features/logs/send.js';
import { removeRoleEverywhere } from '../features/settings/store.js';

const labels = {
  member: 'members',
  bot: 'bots',
  both: 'members and bots',
} as const;

export class RoleDeleteListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { name: 'RoleDelete', event: Events.GuildRoleDelete });
  }

  public override run(role: Role) {
    try {
      const removed = removeRoleEverywhere(this.container.db, role.guild.id, role.id);
      if (removed.length === 0) return;
      const label = removed.length > 1 ? labels.both : labels[removed[0] as 'member' | 'bot'];
      void logMod(role.guild.id, {
        type: 'setting_auto_cleared',
        setting: 'autorole',
        id: role.id,
        detail: `role was deleted (removed from ${label})`,
      });
    } catch (error) {
      this.container.logger.error(`role delete cleanup failed for ${role.id}`, error);
    }
  }
}
