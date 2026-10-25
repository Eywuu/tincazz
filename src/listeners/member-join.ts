import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { assignAutoRoles } from '../features/settings/assign.js';

export class MemberJoinListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { name: 'MemberJoin', event: Events.GuildMemberAdd });
  }

  public override async run(member: GuildMember) {
    try {
      // Members still in membership screening get their roles once they pass it.
      if (!member.pending) await assignAutoRoles(member);
    } catch (error) {
      this.container.logger.error(`member join handling failed for ${member.id}`, error);
    }
  }
}
