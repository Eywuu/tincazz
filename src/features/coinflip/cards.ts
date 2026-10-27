import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ContainerBuilder } from 'discord.js';
import type { FlipSide } from '../../db/schema.js';
import { spinErrorText } from '../gamba/index.js';
import { accents, card, coins, discordTime } from '../ui/index.js';
import { flipAnimation } from './config.js';
import {
  type ChallengeAction,
  type ChallengeId,
  encodeChallengeId,
  encodeFlipAgainId,
} from './custom-ids.js';
import { ChallengeTakenError, ShortStakeError } from './errors.js';
import type { BotFlip, SettledChallenge } from './play.js';

export type ChallengeView = Omit<ChallengeId, 'kind' | 'action'>;

export const notYourFlip = "This isn't your flip. Use `/coinflip bot` to flip your own.";
export const notYourChallenge = "This challenge isn't for you.";
export const challengeTaken = 'Someone already took this challenge.';
export const cannotChallengeSelf = "You can't challenge yourself.";
export const cannotChallengeBot = "Bots don't flip coins. Use `/coinflip bot`.";

const sideLabel = (side: FlipSide) => (side === 'heads' ? 'Heads' : 'Tails');

function button(label: string, customId: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(style);
}

export function botFlipCard(userId: string, flip: BotFlip): ContainerBuilder {
  const net = flip.won ? flip.credited - flip.bet : -flip.bet;
  return card(
    flip.won ? accents.win : accents.loss,
    `# 🪙 ${sideLabel(flip.result)}`,
    `Called **${sideLabel(flip.side)}** · ${net >= 0 ? '+' : '-'}${coins(Math.abs(net))}`,
    `-# <@${userId}> · balance ${coins(flip.balance)} · pot ${coins(flip.pot)}`,
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button(
        'Flip again',
        encodeFlipAgainId({ userId, bet: flip.bet, side: flip.side }),
        ButtonStyle.Primary,
      ),
    ),
  );
}

/** One frame of a coin in the air: no buttons, alternating sides. */
export function flippingCard(frame: number, caption: string): ContainerBuilder {
  const side = frame % 2 === 0 ? 'heads' : 'tails';
  return card(accents.brand, `# 🪙 ${sideLabel(side)}…`, caption, '-# flipping');
}

function flippingFrames(caption: string): ContainerBuilder[] {
  return Array.from({ length: flipAnimation.frames }, (_, frame) => flippingCard(frame, caption));
}

export function botFlipFrames(userId: string, flip: Pick<BotFlip, 'bet' | 'side'>) {
  return flippingFrames(`<@${userId}> called **${sideLabel(flip.side)}** · ${coins(flip.bet)}`);
}

export function challengeFlipFrames(view: ChallengeView, acceptorId: string) {
  return flippingFrames(`<@${view.challengerId}> vs <@${acceptorId}> · ${coins(view.bet)} each`);
}

export function challengeCard(view: ChallengeView): ContainerBuilder {
  const { challengerId, opponentId, bet, side, expiresAt } = view;
  const who =
    opponentId === undefined
      ? `Anyone with ${coins(bet)} coins can accept.`
      : `<@${opponentId}> can accept.`;
  const id = (action: ChallengeAction) => encodeChallengeId({ ...view, action });
  const buttons = [button('Accept', id('accept'), ButtonStyle.Success)];
  if (opponentId !== undefined) {
    buttons.push(button('Decline', id('decline'), ButtonStyle.Danger));
  }
  buttons.push(button('Cancel', id('cancel'), ButtonStyle.Secondary));
  return card(
    accents.brand,
    '## Coinflip challenge',
    `<@${challengerId}> bets **${coins(bet)}** on ${sideLabel(side).toLowerCase()}`,
    who,
    `Expires ${discordTime(expiresAt)}`,
  ).addActionRowComponents(new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons));
}

export function challengeResultCard(
  _view: ChallengeView,
  settled: SettledChallenge,
): ContainerBuilder {
  return card(
    accents.gold,
    `# 🪙 ${sideLabel(settled.result)}`,
    `<@${settled.winnerId}> wins **${coins(settled.credited)}**`,
    `-# rake ${coins(settled.rake)} to the pot · pot ${coins(settled.pot)}`,
  );
}

export type ChallengeClosedReason = 'expired' | 'declined' | 'cancelled' | 'challenger-short';

export function challengeClosedCard(
  view: ChallengeView,
  reason: ChallengeClosedReason,
): ContainerBuilder {
  const texts: Record<ChallengeClosedReason, string> = {
    expired: 'Challenge expired.',
    declined: `<@${view.opponentId}> declined.`,
    cancelled: `<@${view.challengerId}> cancelled.`,
    'challenger-short': `<@${view.challengerId}> can't cover the bet anymore.`,
  };
  return card(accents.loss, texts[reason]);
}

export function flipErrorText(error: unknown): string | undefined {
  if (error instanceof ShortStakeError) {
    return `You need ${coins(error.needed)} coins to accept. You have ${coins(error.balance)}.`;
  }
  if (error instanceof ChallengeTakenError) {
    return challengeTaken;
  }
  return spinErrorText(error);
}
