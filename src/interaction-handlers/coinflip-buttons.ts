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
  isChallengeSettled,
  notYourChallenge,
  notYourFlip,
  reopen,
  ShortStakeError,
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
    return this.updateCard(interaction, cardReply(botFlipCard(userId, flip)));
  }

  /**
   * Updates the card. The coins have already moved, so if Discord rejects the update the result is
   * put on the message by a plain edit instead of being lost behind "interaction failed".
   */
  private async updateCard(interaction: ButtonInteraction, reply: ReturnType<typeof cardReply>) {
    try {
      return await interaction.update(reply);
    } catch (error) {
      this.container.logger.error(
        `coinflip: could not update ${interaction.message.id}, editing instead: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      return interaction.message.edit(reply);
    }
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
    // The registry is lost on restart; the flip row is not.
    if (!tryClose(messageId) || isChallengeSettled(this.container.db, messageId)) {
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
    if (!tryClose(messageId) || isChallengeSettled(this.container.db, messageId)) {
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
      // live, with its original expiry handler armed again for the time that is left.
      reopen(messageId, Math.max(0, id.expiresAt - Date.now()));
      throw error;
    }
    return this.updateCard(interaction, cardReply(challengeResultCard(view, settled)));
  }
}
