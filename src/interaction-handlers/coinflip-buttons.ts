import { InteractionHandler, InteractionHandlerTypes } from '@sapphire/framework';
import type { ButtonInteraction } from 'discord.js';
import {
  botFlipCard,
  type ChallengeId,
  ChallengeTakenError,
  type ChallengeView,
  type CoinflipId,
  challengeClosedCard,
  challengeResultCard,
  challengeTaken,
  decodeCoinflipId,
  type FlipAgainId,
  flipErrorText,
  notYourChallenge,
  notYourFlip,
  reopen,
  ShortStakeError,
  scheduleExpiry,
  settleBotFlip,
  settleChallenge,
  tryClose,
} from '../features/coinflip/index.js';
import { cardReply, errorReply } from '../features/ui/index.js';

export class CoinflipButtonsHandler extends InteractionHandler {
  public constructor(
    context: InteractionHandler.LoaderContext,
    options: InteractionHandler.Options,
  ) {
    super(context, { ...options, interactionHandlerType: InteractionHandlerTypes.Button });
  }

  public override parse(interaction: ButtonInteraction) {
    const id = decodeCoinflipId(interaction.customId);
    return id ? this.some(id) : this.none();
  }

  public override async run(interaction: ButtonInteraction, id: CoinflipId) {
    // Errors keep the card as it was: a stale button only gets a private explanation.
    try {
      return id.kind === 'again'
        ? await this.flipAgain(interaction, id)
        : await this.answer(interaction, id);
    } catch (error) {
      const text = flipErrorText(error);
      if (text === undefined) {
        throw error;
      }
      return interaction.reply(errorReply(text));
    }
  }

  private async flipAgain(interaction: ButtonInteraction, id: FlipAgainId) {
    const userId = interaction.user.id;
    if (userId !== id.userId) {
      return interaction.reply(errorReply(notYourFlip));
    }
    const flip = settleBotFlip(
      this.container.db,
      { guildId: interaction.guildId as string, userId, bet: String(id.bet), side: id.side },
      Date.now(),
    );
    return interaction.update(cardReply(botFlipCard(userId, flip)));
  }

  private async answer(interaction: ButtonInteraction, id: ChallengeId) {
    const clickerId = interaction.user.id;
    const messageId = interaction.message.id;
    const view: ChallengeView = {
      challengerId: id.challengerId,
      opponentId: id.opponentId,
      bet: id.bet,
      side: id.side,
      expiresAt: id.expiresAt,
    };

    if (id.action === 'accept') {
      const allowed =
        id.opponentId === undefined ? clickerId !== id.challengerId : clickerId === id.opponentId;
      if (!allowed) {
        return interaction.reply(errorReply(notYourChallenge));
      }
      return this.accept(interaction, id, view, messageId);
    }

    const owner = id.action === 'decline' ? id.opponentId : id.challengerId;
    if (clickerId !== owner) {
      return interaction.reply(errorReply(notYourChallenge));
    }
    if (!tryClose(messageId)) {
      return interaction.reply(errorReply(challengeTaken));
    }
    const reason = id.action === 'decline' ? 'declined' : 'cancelled';
    return interaction.update(cardReply(challengeClosedCard(view, reason)));
  }

  private async accept(
    interaction: ButtonInteraction,
    id: ChallengeId,
    view: ChallengeView,
    messageId: string,
  ) {
    if (!tryClose(messageId)) {
      return interaction.reply(errorReply(challengeTaken));
    }
    if (Date.now() > id.expiresAt) {
      return interaction.update(cardReply(challengeClosedCard(view, 'expired')));
    }

    let settled: ReturnType<typeof settleChallenge>;
    try {
      settled = settleChallenge(
        this.container.db,
        {
          guildId: interaction.guildId as string,
          messageId,
          mode: id.opponentId === undefined ? 'open' : 'challenge',
          challengerId: id.challengerId,
          acceptorId: interaction.user.id,
          bet: id.bet,
          challengerSide: id.side,
        },
        Date.now(),
      );
    } catch (error) {
      if (error instanceof ShortStakeError && error.who === 'challenger') {
        return interaction.update(cardReply(challengeClosedCard(view, 'challenger-short')));
      }
      if (error instanceof ChallengeTakenError) {
        return interaction.reply(errorReply(challengeTaken));
      }
      // The acceptor can try again once funded (or someone else can accept), so the card stays
      // live, with its expiry timer put back for the time that is left.
      reopen(messageId);
      scheduleExpiry(messageId, Math.max(0, id.expiresAt - Date.now()), () =>
        interaction.message.edit(cardReply(challengeClosedCard(view, 'expired'))),
      );
      throw error;
    }
    return interaction.update(cardReply(challengeResultCard(view, settled)));
  }
}
