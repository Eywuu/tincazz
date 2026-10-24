import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import {
  categoryLabels,
  isLeaderboardCategory,
  leaderboardCategories,
  renderLeaderboard,
} from '../../features/stats/index.js';
import { cardReply } from '../../features/ui/index.js';

export class LeaderboardCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'leaderboard', description: 'Shows the top players' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .addStringOption((option) =>
          option
            .setName('category')
            .setDescription('Which board to show (default: coins)')
            .addChoices(
              ...leaderboardCategories.map((value) => ({
                name: categoryLabels[value],
                value,
              })),
            ),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const option = interaction.options.getString('category');
    const category = option !== null && isLeaderboardCategory(option) ? option : 'coins';
    return interaction.reply(
      cardReply(
        renderLeaderboard(
          this.container.db,
          interaction.guildId as string,
          interaction.user.id,
          category,
          0,
        ),
      ),
    );
  }
}
