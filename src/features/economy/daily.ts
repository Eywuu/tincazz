import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { cashbackFor } from './cashback.js';
import { daily } from './config.js';
import { AlreadyClaimedError } from './errors.js';
import { credit } from './ledger.js';
import { dayMs, utcDay } from './time.js';
import { getOrCreateWallet } from './wallets.js';

export function dailyAmount(streak: number): number {
  return daily.base + daily.perStreakDay * Math.min(streak, daily.streakCap);
}

export interface DailyResult {
  amount: number;
  /** Cashback on yesterday's gambling losses, paid as its own ledger row; 0 if none. */
  cashback: number;
  balance: number;
  streak: number;
  nextAt: number;
}

export function claimDaily(db: Db, guildId: string, userId: string, now: number): DailyResult {
  return db.transaction((tx) => {
    const wallet = getOrCreateWallet(tx, guildId, userId, now);
    const today = utcDay(now);
    const nextAt = (today + 1) * dayMs;
    if (wallet.lastDailyAt !== null && utcDay(wallet.lastDailyAt) === today) {
      throw new AlreadyClaimedError(nextAt);
    }
    const continues = wallet.lastDailyAt !== null && utcDay(wallet.lastDailyAt) === today - 1;
    const streak = continues ? wallet.dailyStreak + 1 : 1;
    const amount = dailyAmount(streak);
    let balance = credit(tx, { guildId, userId, amount, reason: 'daily', now });
    const cashback = cashbackFor(tx, guildId, userId, now);
    if (cashback > 0) {
      balance = credit(tx, { guildId, userId, amount: cashback, reason: 'cashback', now });
    }
    tx.update(wallets)
      .set({ dailyStreak: streak, lastDailyAt: now })
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .run();
    return { amount, cashback, balance, streak, nextAt };
  });
}
