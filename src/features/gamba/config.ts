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

/**
 * Progressive pot: seed, share of each bet added to it (only for bets over `contributionAbove`),
 * and the bet that earns a full share.
 *
 * `shareBps` is what the rarer wins take from the pot's excess over the seed, in basis points (the
 * jackpot takes the whole pot). Taken from the excess, a share never mints coins or pulls the pot
 * under the seed, and each win takes at most a tenth of it, so the pot pays out steadily instead of
 * sitting until a 1 in 9,261 jackpot. A full-share spin pays out about 0.05% of the excess on
 * average, about three and a half times what the jackpot alone does.
 */
export const pot = {
  seed: 10_000,
  contributionPercent: 3,
  contributionAbove: 100,
  fullShareBet: 500,
  shareBps: { pythonPair: 25, cppPair: 100, ytTriple: 100, pythonTriple: 1_000 },
} as const;
