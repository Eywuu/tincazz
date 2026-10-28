/** Coinflip rules: the share of the pool raked into the gamba pot, and how long challenges live. */
export const coinflip = {
  rakePercent: 3,
  expiryMs: { challenge: 60_000, open: 120_000 },
} as const;

/** The stages of a coin in the air, shown in order before the result card. */
export const flipAnimation = { stages: ['toss', 'spin', 'fall', 'edge'] } as const;

export type FlipStage = (typeof flipAnimation.stages)[number];
