export const startingBalance = 1_000;

export const daily = { base: 200, perStreakDay: 50, streakCap: 7 } as const;

export const bailout = { amount: 200, belowBalance: 10, cooldownMs: 3_600_000 } as const;

export const chatReward = { amount: 5, cooldownMs: 60_000 } as const;

export const admin = { maxAmount: 1_000_000, reasonMaxLength: 200 } as const;
