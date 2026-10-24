import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction, StringSelectMenuInteraction } from 'discord.js';
import {
  decodeLeaderboardId,
  isLeaderboardCategory,
  type LeaderboardCategory,
  notYourLeaderboard,
  renderLeaderboard,
} from '../features/stats/index.js';
import { cardReply, errorReply } from '../features/ui/index.js';

interface LeaderboardClick {
  ownerId: string;
  category: LeaderboardCategory;
  page: number;
}

export class LeaderboardComponentsHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, {
      ...options,
      interactionHandlerType: InteractionHandlerTypes.MessageComponent,
    });
  }

  public override parse(interaction: ButtonInteraction | StringSelectMenuInteraction) {
    const id = decodeLeaderboardId(interaction.customId);
    if (!id) {
      return this.none();
    }
    if (id.kind === 'page') {
      return interaction.isButton() ? this.some<LeaderboardClick>(id) : this.none();
    }
    if (!interaction.isStringSelectMenu()) {
      return this.none();
    }
    const [category] = interaction.values;
    if (category === undefined || !isLeaderboardCategory(category)) {
      return this.none();
    }
    return this.some<LeaderboardClick>({ ownerId: id.ownerId, category, page: 0 });
  }

  public override async run(
    interaction: ButtonInteraction | StringSelectMenuInteraction,
    click: LeaderboardClick,
  ) {
    if (interaction.user.id !== click.ownerId) {
      return interaction.reply(errorReply(notYourLeaderboard));
    }
    return interaction.update(
      cardReply(
        renderLeaderboard(
          this.container.db,
          interaction.guildId as string,
          click.ownerId,
          click.category,
          click.page,
        ),
      ),
    );
  }
}
