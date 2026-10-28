export const logKinds = ['economy', 'mod'] as const;
export type LogKind = (typeof logKinds)[number];

/** Coin amounts at which a spin, flip or dice roll is worth a line in the economy log. */
export const logThresholds = { bigSpin: 5_000, bigFlip: 5_000, bigRoll: 5_000 } as const;
