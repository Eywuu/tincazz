import { Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import type { Message } from 'discord.js';
import { formatGambaReply, spinGamba } from '../../features/gamba/index.js';

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
    await message.reply(formatGambaReply(message.author.toString(), reels));
  }
}
