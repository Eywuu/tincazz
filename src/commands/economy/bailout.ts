import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { bailoutCard, claimBailout, claimErrorText } from '../../features/economy/index.js';
import { cardReply, errorReply } from '../../features/ui/index.js';

export class BailoutCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'bailout', description: 'Get a bailout when you are broke' });
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
      const result = claimBailout(
        this.container.db,
        interaction.guildId as string,
        interaction.user.id,
        Date.now(),
      );
      return await interaction.reply(cardReply(bailoutCard(result)));
    } catch (error) {
      const text = claimErrorText(error);
      if (text === undefined) {
        throw error;
      }
      return interaction.reply(errorReply(text));
    }
  }
}
