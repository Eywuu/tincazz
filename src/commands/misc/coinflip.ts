import { Command } from '@sapphire/framework';
import {
  type ChatInputCommandInteraction,
  InteractionContextType,
  type SlashCommandSubcommandBuilder,
} from 'discord.js';
import { type FlipSide, flipSides } from '../../db/schema.js';
import {
  animate,
  botFlipCard,
  botFlipFrames,
  type ChallengeView,
  cannotChallengeBot,
  cannotChallengeSelf,
  challengeCard,
  challengeClosedCard,
  coinflip,
  flipErrorText,
  scheduleExpiry,
  settleBotFlip,
} from '../../features/coinflip/index.js';
import { getOrCreateWallet } from '../../features/economy/index.js';
import { parseBet, wager } from '../../features/gamba/index.js';
import { botFlipLogEvent } from '../../features/logs/economy.js';
import { logEconomy } from '../../features/logs/send.js';
import { cardReply, errorReply } from '../../features/ui/index.js';

export class CoinflipCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'coinflip', description: 'Flip a coin for coins' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    const withOptions = (sub: SlashCommandSubcommandBuilder) =>
      sub
        .addStringOption((option) =>
          option
            .setName('bet')
            .setDescription('Coins to bet: 10 to 10,000, all, half or 2.5k (default: 10)'),
        )
        .addStringOption((option) =>
          option
            .setName('side')
            .setDescription('Your call (default: heads)')
            .addChoices({ name: 'Heads', value: 'heads' }, { name: 'Tails', value: 'tails' }),
        );

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .addSubcommand((sub) =>
          withOptions(sub.setName('bot').setDescription('Flip against the bot')),
        )
        .addSubcommand((sub) =>
          withOptions(
            sub
              .setName('challenge')
              .setDescription('Challenge a member to a coinflip')
              .addUserOption((option) =>
                option.setName('opponent').setDescription('Who to challenge').setRequired(true),
              ),
          ),
        )
        .addSubcommand((sub) =>
          withOptions(sub.setName('open').setDescription('Open a coinflip anyone can accept')),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const bet = interaction.options.getString('bet') ?? undefined;
    const requested = interaction.options.getString('side');
    const side: FlipSide = flipSides.find((value) => value === requested) ?? 'heads';

    try {
      if (interaction.options.getSubcommand() === 'bot') {
        return await this.flipBot(interaction, bet, side);
      }
      return await this.challenge(interaction, bet, side);
    } catch (error) {
      const text = flipErrorText(error);
      if (text === undefined) {
        throw error;
      }
      return interaction.reply(errorReply(text));
    }
  }

  private async flipBot(
    interaction: ChatInputCommandInteraction,
    bet: string | undefined,
    side: FlipSide,
  ) {
    const userId = interaction.user.id;
    const flip = settleBotFlip(
      this.container.db,
      { guildId: interaction.guildId as string, userId, bet, side },
      Date.now(),
    );
    const event = botFlipLogEvent(userId, flip);
    if (event) void logEconomy(interaction.guildId as string, event);
    return animate(
      { first: (reply) => interaction.reply(reply), next: (reply) => interaction.editReply(reply) },
      botFlipFrames(userId, flip),
      botFlipCard(userId, flip),
    );
  }

  private async challenge(
    interaction: ChatInputCommandInteraction,
    bet: string | undefined,
    side: FlipSide,
  ) {
    const challengerId = interaction.user.id;
    const mode = interaction.options.getSubcommand() === 'open' ? 'open' : 'challenge';
    const opponent = mode === 'challenge' ? interaction.options.getUser('opponent', true) : null;
    if (opponent?.id === challengerId) {
      return interaction.reply(errorReply(cannotChallengeSelf));
    }
    if (opponent?.bot) {
      return interaction.reply(errorReply(cannotChallengeBot));
    }

    // Nothing is escrowed: the stake is only checked here and debited when someone accepts.
    const now = Date.now();
    const wallet = getOrCreateWallet(
      this.container.db,
      interaction.guildId as string,
      challengerId,
      now,
    );
    const amount = parseBet(bet?.trim() || String(wager.defaultBet), wallet.balance);
    const view: ChallengeView = {
      challengerId,
      opponentId: opponent?.id,
      bet: amount,
      side,
      expiresAt: now + coinflip.expiryMs[mode],
    };

    const { resource } = await interaction.reply({
      ...cardReply(challengeCard(view)),
      ...(opponent ? { allowedMentions: { users: [opponent.id] } } : {}),
      withResponse: true,
    });
    const messageId = resource?.message?.id;
    if (messageId) {
      scheduleExpiry(messageId, view.expiresAt - now, () =>
        interaction.editReply(cardReply(challengeClosedCard(view, 'expired'))),
      );
    }
  }
}
