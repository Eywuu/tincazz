import { randomInt as cryptoRandomInt } from 'node:crypto';
import { type FlipSide, flipSides } from '../../db/schema.js';
import type { RandomInt } from '../gamba/roll.js';

/** Flips a fair coin: a draw of 0 is heads, 1 is tails. */
export function flipCoin(randomInt: RandomInt = cryptoRandomInt): FlipSide {
  return flipSides[randomInt(2)] as FlipSide;
}

export function otherSide(side: FlipSide): FlipSide {
  return side === 'heads' ? 'tails' : 'heads';
}
