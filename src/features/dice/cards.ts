import { ActionRowBuilder, ButtonBuilder, ButtonStyle, type ContainerBuilder } from 'discord.js';
import { spinErrorText } from '../gamba/index.js';
import { accents, card, coins } from '../ui/index.js';
import { callLabel, dieFace } from './calls.js';
import { encodeRollAgainId } from './custom-ids.js';
import type { Roll } from './play.js';
import { needsText } from './rules.js';

export const notYourRoll = "This isn't your roll. Use `/dice` to roll your own.";

/** Dice bets fail like gamba spins do, so the messages stay identical. */
export const diceErrorText = spinErrorText;

export function rollCard(userId: string, roll: Roll): ContainerBuilder {
  const { bet, call, die1, die2, total, won, payout } = roll;
  const net = payout - bet;
  return card(
    won ? accents.win : accents.loss,
    `# 🎲 ${dieFace(die1)} ${dieFace(die2)} = ${total} · ${callLabel(call).toUpperCase()} ${won ? '✓' : '✗'}`,
    `Called **${callLabel(call)}** · ${net >= 0 ? '+' : '-'}${coins(Math.abs(net))}`,
    `-# <@${userId}> · balance ${coins(roll.balance)} · pot ${coins(roll.pot)}`,
  ).addActionRowComponents(
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setLabel('Roll again')
        .setCustomId(encodeRollAgainId({ userId, bet, call }))
        .setStyle(ButtonStyle.Primary),
    ),
  );
}

const randomFace = () => dieFace(1 + Math.floor(Math.random() * 6));

/**
 * The cosmetic build-up to a settled roll: two tumbling dice, the first one landing, then what it
 * leaves the player needing. The second die and the outcome are never shown, so frames cannot
 * contradict the result card.
 */
export function rollFrames(userId: string, roll: Pick<Roll, 'bet' | 'call' | 'die1'>) {
  const caption = `<@${userId}> called **${callLabel(roll.call)}** · ${coins(roll.bet)}`;
  const tumble = () =>
    card(accents.brand, `# 🎲 ${randomFace()} ${randomFace()}`, caption, '-# tumbling');
  const first = dieFace(roll.die1);
  return [
    tumble(),
    tumble(),
    card(accents.brand, `# 🎲 ${first} 🎲`, caption, '-# first die down'),
    card(accents.gold, `# 🎲 ${first} 🎲`, caption, `-# ${needsText(roll.call, roll.die1)}`),
  ];
}
