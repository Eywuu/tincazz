import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { bailout } from './config.js';
import { CooldownError, NotEligibleError } from './errors.js';
import { credit } from './ledger.js';
import { getOrCreateWallet } from './wallets.js';

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
    const balance = credit(tx, { guildId, userId, amount: bailout.amount, reason: 'bailout', now });
    tx.update(wallets)
      .set({ lastBailoutAt: now })
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .run();
    return { amount: bailout.amount, balance };
  });
}
