import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { collect } from './config.js';
import { CollectNotReadyError } from './errors.js';
import { credit } from './ledger.js';
import { getOrCreateWallet } from './wallets.js';

const hourMs = 3_600_000;

export interface CollectResult {
  amount: number;
  hours: number;
  balance: number;
  /** When the next full hour has accrued. */
  nextAt: number;
  /** When the stack is full again. */
  fullAt: number;
}

/**
 * Pays `perHour` for every full hour since the last collect (or the wallet's creation), up to
 * `maxHours`. A partial hour carries over; time past a full stack is lost.
 */
export function claimCollect(db: Db, guildId: string, userId: string, now: number): CollectResult {
  return db.transaction((tx) => {
    const wallet = getOrCreateWallet(tx, guildId, userId, now);
    const from = wallet.lastCollectAt ?? wallet.createdAt;
    const elapsed = Math.floor((now - from) / hourMs);
    if (elapsed < 1) {
      throw new CollectNotReadyError(from + hourMs);
    }
    const hours = Math.min(elapsed, collect.maxHours);
    const collectedAt = elapsed >= collect.maxHours ? now : from + hours * hourMs;
    const amount = hours * collect.perHour;
    const balance = credit(tx, { guildId, userId, amount, reason: 'collect', now });
    tx.update(wallets)
      .set({ lastCollectAt: collectedAt })
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .run();
    return {
      amount,
      hours,
      balance,
      nextAt: collectedAt + hourMs,
      fullAt: collectedAt + collect.maxHours * hourMs,
    };
  });
}
