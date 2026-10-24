import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import type { Message } from 'discord.js';
import {
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
    await message.reply(formatGambaReply(message.author.toString(), reels, jackpot));
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
