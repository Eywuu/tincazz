import { coins } from '../ui/index.js';
import { type Spin, threeOfAKindOdds } from './index.js';
import { gambaJackpotRoleId, outcomeEmoji } from './outcomes.js';

const prizeGif = 'https://klipy.com/gifs/smol-smolcat-5';

/** The classic `?gamba` roll: the reels, the stake and the balance. */
export function formatGambaReply(spin: Spin): string {
  const reels = spin.reels.map(outcomeEmoji).join(' ');
  return `${reels}\nbet ${coins(spin.bet)} → ${coins(spin.payout)} · balance ${coins(spin.balance)}`;
}

/** The classic `?gamba` win message, or undefined unless all three reels match. */
export function formatGambaFollowUp(
  userMention: string,
  spin: Spin,
  roleAssigned?: boolean,
): string | undefined {
  const { result } = spin.evaluation;
  if (result !== 'triple' && result !== 'jackpot') {
    return undefined;
  }
  const lines = [
    `${userMention} won! +${coins(spin.payout)} coins (balance: ${coins(spin.balance)})`,
  ];
  if (spin.potWon > 0) {
    lines.push(`+${coins(spin.potWon)} from the pot`);
  }
  if (result === 'jackpot') {
    const note = roleAssigned === false ? " (couldn't assign the role, tell a mod)" : '';
    lines.push(`You are a pro! You just won <@&${gambaJackpotRoleId}>${note}`);
  }
  const odds = threeOfAKindOdds(spin.reels);
  if (odds !== undefined) {
    lines.push(`\`Odds: 1 in ${coins(odds)}\``);
  }
  if (spin.reels[0] === 'python' || spin.reels[0] === 'cpp') {
    lines.push(prizeGif);
  }
  return lines.join('\n');
}
