import { gambaJackpotRoleId, gambaOutcomes, type OutcomeKey } from './outcomes.js';
import type { FreeSpin, WagerSpin } from './play.js';
import { type RandomInt, rollOutcome } from './roll.js';

export { InvalidBetError, parseBet } from './bet.js';
export {
  announcementCard,
  freeSpinCard,
  notYourSpin,
  spinErrorText,
  tierLabels,
  wagerCard,
} from './cards.js';
export {
  decodeSpinId,
  encodeSpinId,
  type SpinAction,
  type SpinButtonId,
} from './custom-ids.js';
export type { Evaluation } from './evaluate.js';
export { evaluate } from './evaluate.js';
export { assignJackpotRole, type JackpotMember } from './jackpot.js';
export { type FreeSpin, playFree, playWager, type WagerSpin } from './play.js';
export { type SpinMessages, type SpinRequest, spin } from './spin.js';
export type Spin = FreeSpin | WagerSpin;
export { gambaJackpotRoleId };

export type Reels = readonly [OutcomeKey, OutcomeKey, OutcomeKey];

export function spinGamba(randomInt?: RandomInt): Reels {
  const spin = () => rollOutcome(gambaOutcomes, randomInt).key;
  return [spin(), spin(), spin()];
}

export function isJackpot(reels: Reels): boolean {
  return reels.every((reel) => reel === 'cpp');
}

/** The N in "1 in N" for rolling this emoji on all three reels, or undefined if they differ. */
export function threeOfAKindOdds(reels: Reels): number | undefined {
  const [first, second, third] = reels;
  if (first !== second || second !== third) {
    return undefined;
  }
  const outcome = gambaOutcomes.find(({ key }) => key === first);
  if (!outcome) {
    return undefined;
  }
  const total = gambaOutcomes.reduce((sum, { weight }) => sum + weight, 0);
  return Math.round((total / outcome.weight) ** 3);
}
