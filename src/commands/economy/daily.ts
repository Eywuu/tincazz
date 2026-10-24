import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { claimDaily, claimErrorText, dailyCard } from '../../features/economy/index.js';
import { cardReply, errorReply } from '../../features/ui/index.js';

export class DailyCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'daily', description: 'Claim your daily coins' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    try {
      const result = claimDaily(
        this.container.db,
        interaction.guildId as string,
        interaction.user.id,
        Date.now(),
      );
      return await interaction.reply(cardReply(dailyCard(result)));
    } catch (error) {
      const text = claimErrorText(error);
      if (text === undefined) {
        throw error;
      }
      return interaction.reply(errorReply(text));
    }
  }
}
