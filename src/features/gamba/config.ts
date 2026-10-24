/** Bet limits for a wagered spin, in coins. */
export const wager = { minBet: 10, maxBet: 10_000 } as const;

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

/** Payout per tier in basis points of the bet (10,000 bps = the bet returned). */
export const payoutBps = {
  none: 0,
  ytPair: 12_000,
  pythonPair: 40_000,
  cppPair: 100_000,
  ytTriple: 150_000,
  pythonTriple: 1_000_000,
  cppTriple: 3_000_000,
} as const satisfies Record<PayoutTier, number>;

/** Progressive pot: seed, share of each bet added to it, and the bet that earns a full share. */
export const pot = { seed: 10_000, contributionPercent: 3, fullShareBet: 500 } as const;
