/** Bet limits for a wagered spin, in coins; `defaultBet` is what a spin without a bet costs. */
export const wager = { minBet: 10, maxBet: 10_000, defaultBet: 10 } as const;

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
 * Tuned for a near-fair game with a ~1% house edge: over all 21^3 equally weighted draws these pay
 * 91,740,000 bps, a 99.06% return before the pot (which is a bonus on top).
 * `test/gamba-evaluate.test.ts` guards the range.
 */
export const payoutBps = {
  none: 0,
  ytPair: 15_000,
  pythonPair: 40_000,
  cppPair: 100_000,
  ytTriple: 140_000,
  pythonTriple: 900_000,
  cppTriple: 3_000_000,
} as const satisfies Record<PayoutTier, number>;

/** Progressive pot: seed, share of each bet added to it, and the bet that earns a full share. */
export const pot = { seed: 10_000, contributionPercent: 3, fullShareBet: 500 } as const;
