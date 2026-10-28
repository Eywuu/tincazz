import type { BetLimits } from './bet.js';

/** Bet limits for a wagered spin, in coins; `defaultBet` is what a spin without a bet costs. */
export const wager = { minBet: 1, maxBet: 10_000, defaultBet: 1 } as const satisfies BetLimits;

export const payoutTiers = [
  'none',
  'ytPair',
  'pythonPair',
  'cppPair',
  'ytTriple',
  'pythonTriple',
  'cppTriple',
] as const;

export type PayoutTier = (typeof payoutTiers)[number];

/**
 * Payout per tier in basis points of the bet (10,000 bps = the bet returned).
 *
 * Tuned for a near-fair, low-volatility game with a ~1% house edge: over all 21^3 equally weighted
 * draws these pay 91,440,000 bps, a 98.74% return before the pot (which is a bonus on top). Most of
 * the return sits in the common pairs so a bankroll lasts; the jackpot's real prize is the pot.
 * `test/gamba-evaluate.test.ts` guards the range.
 */
export const payoutBps = {
  none: 0,
  ytPair: 20_000,
  pythonPair: 40_000,
  cppPair: 80_000,
  ytTriple: 100_000,
  pythonTriple: 250_000,
  cppTriple: 1_000_000,
} as const satisfies Record<PayoutTier, number>;

/** Progressive pot: seed, share of each bet added to it, and the bet that earns a full share. */
export const pot = { seed: 10_000, contributionPercent: 3, fullShareBet: 500 } as const;
