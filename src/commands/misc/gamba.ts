import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import type { Message } from 'discord.js';
import {
  formatGambaFollowUp,
  formatGambaReply,
  gambaJackpotRoleId,
  playFree,
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
    // Settled first: the prize, spin row and stats stand even if anything below fails.
    const { reels, evaluation, prize, balance } = playFree(
      this.container.db,
      message.guildId as string,
      message.author.id,
      Date.now(),
    );
    const jackpot =
      evaluation.result === 'jackpot'
        ? { roleAssigned: await this.awardJackpotRole(message) }
        : undefined;
    // Ping the user being replied to. The announcement replies to this message so the winning roll
    // stays visible, and pings only the winner (the role renders as a mention without pinging).
    const spin = await message.reply({
      content: formatGambaReply(reels),
      allowedMentions: { repliedUser: true },
    });

    const followUp = formatGambaFollowUp(
      message.author.toString(),
      reels,
      { amount: prize, balance },
      jackpot,
    );
    if (followUp) {
      await spin.reply({ content: followUp, allowedMentions: { users: [message.author.id] } });
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
