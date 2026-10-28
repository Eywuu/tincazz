import type { BetLimits } from '../gamba/bet.js';

/** Bet limits for a roll, in coins; `defaultBet` is what a roll without a bet costs. */
export const wager = { minBet: 10, maxBet: 10_000, defaultBet: 10 } as const satisfies BetLimits;

/** Dice rules: the return before flooring (in bps) and the share of a wager raked as the house edge. */
export const dice = { returnBps: 9_900, edgePercent: 1 } as const;
