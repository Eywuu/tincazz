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

/** Inline-code odds line for a three-of-a-kind win; sent as its own message after the reels. */
export function formatGambaOdds(reels: Reels): string | undefined {
  const odds = threeOfAKindOdds(reels);
  return odds === undefined ? undefined : `\`Odds: 1 in ${odds.toLocaleString('en-US')}\``;
}

export function formatGambaReply(
  userMention: string,
  reels: Reels,
  jackpot?: JackpotResult,
): string {
  const lines = [reels.join(' ')];
  if (jackpot) {
    const note = jackpot.roleAssigned ? '' : " (couldn't assign the role, tell a mod)";
    lines.push(`JACKPOT! ${userMention} just won <@&${gambaJackpotRoleId}>${note}`);
  }
  return lines.join('\n');
}
