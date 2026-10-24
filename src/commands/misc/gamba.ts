import { type Args, Command, CommandOptionsRunTypeEnum } from '@sapphire/framework';
import {
  type ChatInputCommandInteraction,
  type ContainerBuilder,
  InteractionContextType,
  type Message,
} from 'discord.js';
import {
  assignJackpotRole,
  type JackpotMember,
  spin,
  spinErrorText,
} from '../../features/gamba/index.js';
import { accents, card, cardReply, errorReply } from '../../features/ui/index.js';

export class GambaCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, {
      name: 'gamba',
      description: 'Spin the gamba slot machine',
      runIn: CommandOptionsRunTypeEnum.GuildAny,
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) =>
          option
            .setName('bet')
            .setDescription('Coins to bet: 10 to 10,000, all, half or 2.5k (default: free spin)'),
        ),
    );
  }

  public override async messageRun(message: Message, args: Args) {
    const bet = (await args.restResult('string')).unwrapOr(undefined);
    const userId = message.author.id;
    try {
      const { card: result, announcement } = await spin(
        this.container.db,
        { guildId: message.guildId as string, userId, bet },
        Date.now(),
        { assignJackpotRole: () => assignJackpotRole(message.member, userId) },
      );
      // No allowedMentions override: the result card never pings.
      const sent = await message.reply(cardReply(result));
      await this.announce(userId, announcement, () =>
        sent.reply({
          ...cardReply(announcement as ContainerBuilder),
          allowedMentions: { users: [userId] },
        }),
      );
    } catch (error) {
      const text = spinErrorText(error);
      if (text === undefined) {
        throw error;
      }
      await message.reply(cardReply(card(accents.error, text)));
    }
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const bet = interaction.options.getString('bet') ?? undefined;
    const userId = interaction.user.id;
    const member: JackpotMember | null = interaction.inCachedGuild() ? interaction.member : null;
    let messages: Awaited<ReturnType<typeof spin>>;
    try {
      messages = await spin(
        this.container.db,
        { guildId: interaction.guildId as string, userId, bet },
        Date.now(),
        { assignJackpotRole: () => assignJackpotRole(member, userId) },
      );
    } catch (error) {
      const text = spinErrorText(error);
      if (text === undefined) {
        throw error;
      }
      return interaction.reply(errorReply(text));
    }

    const { resource } = await interaction.reply({
      ...cardReply(messages.card),
      withResponse: true,
    });
    const { announcement } = messages;
    await this.announce(userId, announcement, async () => {
      await resource?.message?.reply({
        ...cardReply(announcement as ContainerBuilder),
        allowedMentions: { users: [userId] },
      });
    });
  }

  /** Sends the announcement on its own: a failure is logged and never undoes the sent card. */
  private async announce(
    userId: string,
    announcement: ContainerBuilder | undefined,
    send: () => Promise<unknown>,
  ) {
    if (!announcement) {
      return;
    }
    try {
      await send();
    } catch (error) {
      this.container.logger.error(
        `gamba: could not send the announcement for ${userId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
