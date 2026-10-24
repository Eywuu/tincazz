/** Coinflip rules: the share of the pool raked into the gamba pot, and how long challenges live. */
export const coinflip = {
  rakePercent: 3,
  expiryMs: { challenge: 60_000, open: 120_000 },
} as const;
