import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import type { Message } from 'discord.js';
import {
  formatGambaFollowUp,
  formatGambaReply,
  gambaJackpotRoleId,
  isJackpot,
  spinGamba,
} from '../../features/gamba/index.js';

export class GambaCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, {
      name: 'gamba',
      description: 'Spin the gamba slot machine',
      runIn: CommandOptionsRunTypeEnum.GuildAny,
    });
  }

  public override async messageRun(message: Message) {
    const reels = spinGamba();
    const jackpot = isJackpot(reels)
      ? { roleAssigned: await this.awardJackpotRole(message) }
      : undefined;
    // Ping the user being replied to. The follow-up sends with the client default (no mentions), so
    // the user and role in the jackpot announcement render as mentions without pinging anyone.
    await message.reply({
      content: formatGambaReply(reels),
      allowedMentions: { repliedUser: true },
    });

    const followUp = formatGambaFollowUp(message.author.toString(), reels, jackpot);
    if (followUp && message.channel.isSendable()) {
      await message.channel.send(followUp);
    }
  }

  private async awardJackpotRole(message: Message): Promise<boolean> {
    try {
      if (!message.member) {
        throw new Error('member not cached');
      }
      await message.member.roles.add(gambaJackpotRoleId, 'gamba jackpot');
      return true;
    } catch (error) {
      this.container.logger.warn(
        `gamba: could not assign jackpot role to ${message.author.id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return false;
    }
  }
}
