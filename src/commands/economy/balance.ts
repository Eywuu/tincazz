import { Command } from '@sapphire/framework';
import { type ChatInputCommandInteraction, InteractionContextType } from 'discord.js';
import {
  balanceCard,
  botsHaveNoWallets,
  coinsRank,
  findWallet,
  getOrCreateWallet,
} from '../../features/economy/index.js';
import { cardReply, errorReply } from '../../features/ui/index.js';

export class BalanceCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'balance', description: 'Shows how many coins you have' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .addUserOption((option) =>
          option.setName('user').setDescription('Whose balance to show (default: you)'),
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

    const wallet =
      target.id === interaction.user.id
        ? getOrCreateWallet(db, guildId, target.id, Date.now())
        : findWallet(db, guildId, target.id);
    const rank = wallet ? coinsRank(db, guildId, target.id) : undefined;
    const summary = wallet && rank !== undefined ? { balance: wallet.balance, rank } : undefined;
    return interaction.reply(cardReply(balanceCard(target.id, summary)));
  }
}
