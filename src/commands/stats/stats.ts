import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import { botsHaveNoWallets, getOrCreateWallet } from '../../features/economy/index.js';
import { playerProfile, profileCard } from '../../features/stats/index.js';
import { cardReply, errorReply } from '../../features/ui/index.js';

export class StatsCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'stats', description: 'Shows a gamba profile' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) =>
          option.setName('user').setDescription('Whose stats to show (default: you)'),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const { db } = this.container;
    const guildId = interaction.guildId as string;
    const target = interaction.options.getUser('user') ?? interaction.user;
    if (target.bot) {
      return interaction.reply(errorReply(botsHaveNoWallets));
    }

    const now = Date.now();
    if (target.id === interaction.user.id) {
      getOrCreateWallet(db, guildId, target.id, now);
    }
    const profile = playerProfile(db, guildId, target.id, now);
    return interaction.reply(cardReply(profileCard(target.id, target.displayAvatarURL(), profile)));
  }
}
