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

export function formatGambaReply(reels: Reels, jackpot?: JackpotResult): string {
  const lines = ['GAMBA!', reels.join(' ')];
  if (jackpot) {
    const note = jackpot.roleAssigned ? '' : " (couldn't assign the role, tell a mod)";
    lines.push(`JACKPOT! You won <@&${gambaJackpotRoleId}>${note}`);
  }
  return lines.join('\n');
}
