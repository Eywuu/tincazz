/** Coinflip rules: the share of the pool raked into the gamba pot, and how long challenges live. */
export const coinflip = {
  rakePercent: 3,
  expiryMs: { challenge: 60_000, open: 120_000 },
} as const;

/** The flipping cards shown before a result, and the pause between card edits. */
export const flipAnimation = { frames: 3, frameMs: 650 } as const;
