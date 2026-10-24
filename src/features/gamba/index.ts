import {
  cppEmoji,
  gambaJackpotRoleId,
  gambaOutcomes,
  gambaWinGif,
  pythonEmoji,
} from './outcomes.js';
import { type RandomInt, rollOutcome } from './roll.js';

export { gambaJackpotRoleId };

export type Reels = readonly [string, string, string];

export interface JackpotResult {
  roleAssigned: boolean;
}

export function spinGamba(randomInt?: RandomInt): Reels {
  const spin = () => rollOutcome(gambaOutcomes, randomInt).emoji;
  return [spin(), spin(), spin()];
}

export function isJackpot(reels: Reels): boolean {
  return reels.every((reel) => reel === cppEmoji);
}

/** The N in "1 in N" for rolling this emoji on all three reels, or undefined if they differ. */
export function threeOfAKindOdds(reels: Reels): number | undefined {
  const [first, second, third] = reels;
  if (first !== second || second !== third) {
    return undefined;
  }
  const outcome = gambaOutcomes.find(({ emoji }) => emoji === first);
  if (!outcome) {
    return undefined;
  }
  const total = gambaOutcomes.reduce((sum, { weight }) => sum + weight, 0);
  return Math.round((total / outcome.weight) ** 3);
}

export function formatGambaReply(reels: Reels): string {
  return reels.join(' ');
}

/**
 * The message sent right after the reels, or undefined when there is no win (three of a kind).
 * Every win says so and shows the odds; python and cpp wins add a gif, and a cpp (jackpot) win
 * tells the winner they are a pro and which role they got.
 */
export function formatGambaFollowUp(
  userMention: string,
  reels: Reels,
  jackpot?: JackpotResult,
): string | undefined {
  const odds = threeOfAKindOdds(reels);
  if (odds === undefined) {
    return undefined;
  }

  const lines = [`${userMention} won!`];
  if (jackpot) {
    const note = jackpot.roleAssigned ? '' : " (couldn't assign the role, tell a mod)";
    lines.push(`You are a pro! You just won <@&${gambaJackpotRoleId}>${note}`);
  }
  lines.push(`\`Odds: 1 in ${odds.toLocaleString('en-US')}\``);
  if (reels[0] === pythonEmoji || reels[0] === cppEmoji) {
    lines.push(gambaWinGif);
  }
  return lines.join('\n');
}
