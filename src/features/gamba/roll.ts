import { randomInt as cryptoRandomInt } from 'node:crypto';

/** Returns an integer in `[0, max)`. */
export type RandomInt = (max: number) => number;

export function rollOutcome<T extends { weight: number }>(
  outcomes: readonly T[],
  randomInt: RandomInt = cryptoRandomInt,
): T {
  if (outcomes.length === 0) {
    throw new Error('Cannot roll an empty outcome table');
  }
  if (outcomes.some(({ weight }) => !Number.isInteger(weight) || weight <= 0)) {
    throw new Error('Outcome weights must be positive integers');
  }

  const total = outcomes.reduce((sum, { weight }) => sum + weight, 0);
  let draw = randomInt(total);
  for (const outcome of outcomes) {
    draw -= outcome.weight;
    if (draw < 0) {
      return outcome;
    }
  }
  throw new Error('Random draw fell outside the outcome table');
}
