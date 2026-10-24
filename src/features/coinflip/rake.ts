import { coinflip } from './config.js';

/** Coins raked from a flip's pool (both stakes) into the gamba pot: a percentage, at least one. */
export function flipRake(bet: number): number {
  return Math.max(1, Math.floor((2 * bet * coinflip.rakePercent) / 100));
}
