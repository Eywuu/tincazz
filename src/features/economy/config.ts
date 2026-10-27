export const startingBalance = 1_000;

export const daily = { base: 400, perStreakDay: 75, streakCap: 7 } as const;

/** A floor for broke players: the base plus a bonus while the daily streak is alive. */
export const bailout = {
  base: 200,
  perStreakDay: 25,
  belowBalance: 10,
  cooldownMs: 1_800_000,
} as const;

export const chatReward = { amount: 5, cooldownMs: 60_000 } as const;

export const admin = { maxAmount: 1_000_000, reasonMaxLength: 200 } as const;
