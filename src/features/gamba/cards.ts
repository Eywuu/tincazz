import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ContainerBuilder } from 'discord.js';
import { InsufficientFundsError } from '../economy/errors.js';
import { accents, card, coins } from '../ui/index.js';
import { InvalidBetError } from './bet.js';
import { type PayoutTier, wager } from './config.js';
import { encodeSpinId } from './custom-ids.js';
import { type FreeSpin, type Spin, threeOfAKindOdds, type WagerSpin } from './index.js';
import { gambaJackpotRoleId, outcomeEmoji } from './outcomes.js';

export const tierLabels: Record<PayoutTier, string> = {
  none: 'No match',
  ytPair: 'Pair',
  pythonPair: 'Python pair',
  cppPair: 'C++ pair',
  ytTriple: 'Triple!',
  pythonTriple: 'Python x3!',
  cppTriple: 'JACKPOT',
};

export const notYourSpin = "This isn't your spin. Use `/gamba` to get your own.";

const reelsHeading = (spin: Spin) => `# ${spin.reels.map(outcomeEmoji).join(' ')}`;

function button(label: string, customId: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder().setLabel(label).setCustomId(customId).setStyle(style);
}

export function freeSpinCard(userId: string, spin: FreeSpin): ContainerBuilder {
  const accent =
    spin.evaluation.result === 'jackpot'
      ? accents.gold
      : spin.prize > 0
        ? accents.win
        : accents.loss;
  const outcome =
    spin.prize > 0
      ? `**${tierLabels[spin.evaluation.tier]}** +${coins(spin.prize)} coins`
      : 'No prize this time';
  return card(
    accent,
    reelsHeading(spin),
    outcome,
    `-# <@${userId}> · free spin · balance ${coins(spin.balance)}`,
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      button('Spin again', encodeSpinId({ action: 'again', userId, bet: 0 }), ButtonStyle.Primary),
    ),
  );
}

export function wagerCard(userId: string, spin: WagerSpin): ContainerBuilder {
  const { tier, payoutBps } = spin.evaluation;
  const accent = spin.potWon > 0 ? accents.gold : spin.payout > 0 ? accents.win : accents.loss;
  const outcome =
    tier === 'none'
      ? `**${tierLabels[tier]}**`
      : `**${tierLabels[tier]}** · ${payoutBps / 10_000}x`;
  const net = spin.payout - spin.bet;
  const sign = net >= 0 ? '+' : '-';
  const texts = [
    reelsHeading(spin),
    outcome,
    `Bet ${coins(spin.bet)} → ${coins(spin.payout)} (${sign}${coins(Math.abs(net))})`,
  ];
  if (spin.potWon > 0) {
    texts.push(`+${coins(spin.potWon)} from the pot`);
  }
  texts.push(`-# <@${userId}> · balance ${coins(spin.balance)} · pot ${coins(spin.pot)}`);

  const buttons = [
    button(
      'Spin again',
      encodeSpinId({ action: 'again', userId, bet: spin.bet }),
      ButtonStyle.Primary,
    ),
  ];
  const doubled = spin.bet * 2;
  if (doubled <= wager.maxBet && doubled <= spin.balance) {
    buttons.push(
      button(
        `Double (${coins(doubled)})`,
        encodeSpinId({ action: 'double', userId, bet: doubled }),
        ButtonStyle.Success,
      ),
    );
  }
  return card(accent, ...texts).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
  );
}

export function announcementCard(
  userId: string,
  spin: Spin,
  roleAssigned?: boolean,
): ContainerBuilder {
  const emoji = outcomeEmoji(spin.reels[0]);
  const win =
    spin.mode === 'free'
      ? `+${coins(spin.prize)} coins`
      : `Won ${coins(spin.payout)} on a ${coins(spin.bet)} bet`;
  const texts = [`## <@${userId}> hit ${emoji} x3!`, win];
  if (spin.mode === 'wager' && spin.potWon > 0) {
    texts.push(`+${coins(spin.potWon)} from the pot`);
  }
  if (spin.evaluation.result === 'jackpot') {
    const note = roleAssigned === false ? " (couldn't assign the role, tell a mod)" : '';
    texts.push(`You are a pro! You just won <@&${gambaJackpotRoleId}>${note}`);
  }
  const odds = threeOfAKindOdds(spin.reels);
  if (odds !== undefined) {
    texts.push(`-# Odds: 1 in ${coins(odds)}`);
  }
  return card(accents.gold, ...texts);
}

export function spinErrorText(error: unknown): string | undefined {
  if (error instanceof InvalidBetError) {
    if (error.kind === 'range') {
      return `Bets go from ${coins(wager.minBet)} to ${coins(wager.maxBet)}.`;
    }
    const shown = error.input.trim().slice(0, 20).replaceAll('`', '');
    return `\`${shown}\` isn't a bet. Use a number from ${coins(wager.minBet)} to ${coins(wager.maxBet)}, \`all\`, \`half\` or \`2.5k\`.`;
  }
  if (error instanceof InsufficientFundsError) {
    const hint = error.balance < wager.minBet ? '`/bailout` is available.' : 'Try a smaller bet.';
    return `You have ${coins(error.balance)} coins. ${hint}`;
  }
  return undefined;
}
