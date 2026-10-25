import { Events, Listener } from '@sapphire/framework';
import type { GuildMember } from 'discord.js';
import { assignAutoRoles } from '../features/settings/assign.js';

export class MemberScreeningListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { name: 'MemberScreening', event: Events.GuildMemberUpdate });
  }

  public override async run(oldMember: GuildMember, member: GuildMember) {
    try {
      if (oldMember.pending && !member.pending) await assignAutoRoles(member);
    } catch (error) {
      this.container.logger.error(`member screening handling failed for ${member.id}`, error);
    }
  }
}
