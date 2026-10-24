import { Command } from '@sapphire/framework';
import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  PermissionFlagsBits,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import {
  type AdminAction,
  adminAdjust,
  adminCard,
  admin as adminConfig,
  botsHaveNoWallets,
  ecoNeedsManageServer,
  InsufficientFundsError,
} from '../../features/economy/index.js';
import { cardReply, coins, errorReply } from '../../features/ui/index.js';

export class EcoCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'eco', description: 'Give or take coins (moderators)' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    const withOptions = (sub: SlashCommandSubcommandBuilder, verb: string) =>
      sub
        .setDescription(`${verb} coins`)
        .addUserOption((o) => o.setName('user').setDescription('The member').setRequired(true))
        .addIntegerOption((o) =>
          o
            .setName('amount')
            .setDescription('How many coins')
            .setRequired(true)
            .setMinValue(1)
            .setMaxValue(adminConfig.maxAmount),
        )
        .addStringOption((o) =>
          o
            .setName('reason')
            .setDescription('Why')
            .setRequired(true)
            .setMaxLength(adminConfig.reasonMaxLength),
        );

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => withOptions(sub.setName('give'), 'Give'))
        .addSubcommand((sub) => withOptions(sub.setName('take'), 'Take')),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    // The default member permission can be widened in Server Settings -> Integrations; coins only
    // move for members who really have Manage Server.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply(errorReply(ecoNeedsManageServer));
    }
    const action = interaction.options.getSubcommand() as AdminAction;
    const user = interaction.options.getUser('user', true);
    const amount = interaction.options.getInteger('amount', true);
    const reason = interaction.options.getString('reason', true);
    if (user.bot) {
      return interaction.reply(errorReply(botsHaveNoWallets));
    }

    try {
      const result = adminAdjust(this.container.db, {
        guildId: interaction.guildId as string,
        userId: user.id,
        actorId: interaction.user.id,
        action,
        amount,
        reason,
        now: Date.now(),
      });
      return await interaction.reply(
        cardReply(adminCard(action, user.id, result, reason.trim()), { ephemeral: true }),
      );
    } catch (error) {
      if (error instanceof InsufficientFundsError) {
        return interaction.reply(
          errorReply(`<@${user.id}> only has ${coins(error.balance)} coins.`),
        );
      }
      throw error;
    }
  }
}
