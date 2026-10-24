import { cppEmoji, gambaJackpotRoleId, gambaOutcomes } from './outcomes.js';
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
 * The message sent right after the reels: the winner announcement on a jackpot, then the odds of
 * any three of a kind as inline code. Undefined when there is nothing to add.
 */
export function formatGambaFollowUp(
  userMention: string,
  reels: Reels,
  jackpot?: JackpotResult,
): string | undefined {
  const lines: string[] = [];
  if (jackpot) {
    const note = jackpot.roleAssigned ? '' : " (couldn't assign the role, tell a mod)";
    lines.push(`${userMention} just won <@&${gambaJackpotRoleId}>${note}`);
  }
  const odds = threeOfAKindOdds(reels);
  if (odds !== undefined) {
    lines.push(`\`Odds: 1 in ${odds.toLocaleString('en-US')}\``);
  }
  return lines.length > 0 ? lines.join('\n') : undefined;
}
