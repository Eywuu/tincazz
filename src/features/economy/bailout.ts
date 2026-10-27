import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { bailout, daily } from './config.js';
import { CooldownError, NotEligibleError } from './errors.js';
import { credit } from './ledger.js';
import { utcDay } from './time.js';
import { getOrCreateWallet } from './wallets.js';

export function bailoutAmount(streak: number): number {
  return bailout.base + bailout.perStreakDay * Math.min(streak, daily.streakCap);
}

/** The daily streak while it can still continue (last claim today or yesterday), otherwise 0. */
export function liveStreak(
  wallet: { dailyStreak: number; lastDailyAt: number | null },
  now: number,
): number {
  if (wallet.lastDailyAt === null) return 0;
  return utcDay(now) - utcDay(wallet.lastDailyAt) <= 1 ? wallet.dailyStreak : 0;
}

export interface BailoutResult {
  amount: number;
  balance: number;
}

export function claimBailout(db: Db, guildId: string, userId: string, now: number): BailoutResult {
  return db.transaction((tx) => {
    const wallet = getOrCreateWallet(tx, guildId, userId, now);
    if (wallet.balance >= bailout.belowBalance) {
      throw new NotEligibleError(wallet.balance);
    }
    if (wallet.lastBailoutAt !== null && now < wallet.lastBailoutAt + bailout.cooldownMs) {
      throw new CooldownError(wallet.lastBailoutAt + bailout.cooldownMs);
    }
    const amount = bailoutAmount(liveStreak(wallet, now));
    const balance = credit(tx, { guildId, userId, amount, reason: 'bailout', now });
    tx.update(wallets)
      .set({ lastBailoutAt: now })
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .run();
    return { amount, balance };
  });
}
