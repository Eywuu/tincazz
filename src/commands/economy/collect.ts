import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { claimCollect, claimErrorText, collectCard } from '../../features/economy/index.js';
import { cardReply, errorReply } from '../../features/ui/index.js';

export class CollectCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, {
      name: 'collect',
      description: 'Collect the coins stacked up since your last collect',
    });
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
      const result = claimCollect(
        this.container.db,
        interaction.guildId as string,
        interaction.user.id,
        Date.now(),
      );
      return await interaction.reply(cardReply(collectCard(result)));
    } catch (error) {
      const text = claimErrorText(error);
      if (text === undefined) {
        throw error;
      }
      return interaction.reply(errorReply(text));
    }
  }
}
