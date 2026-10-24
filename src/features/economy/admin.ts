import type { Db } from '../../db/index.js';
import { admin } from './config.js';
import { credit, debit } from './ledger.js';
import { getOrCreateWallet } from './wallets.js';

export type AdminAction = 'give' | 'take';

export interface AdminAdjustInput {
  guildId: string;
  userId: string;
  actorId: string;
  action: AdminAction;
  amount: number;
  reason: string;
  now: number;
}

/** Moderator give/take. Everything, including wallet creation, rolls back if the take fails. */
export function adminAdjust(db: Db, input: AdminAdjustInput): { amount: number; balance: number } {
  const { guildId, userId, actorId, action, amount, now } = input;
  const note = input.reason.trim();
  if (!Number.isInteger(amount) || amount < 1 || amount > admin.maxAmount) {
    throw new RangeError(`Amount must be an integer from 1 to ${admin.maxAmount}`);
  }
  if (note.length < 1 || note.length > admin.reasonMaxLength) {
    throw new RangeError(`Reason must be 1 to ${admin.reasonMaxLength} characters`);
  }
  return db.transaction((tx) => {
    getOrCreateWallet(tx, guildId, userId, now);
    const entry = { guildId, userId, amount, now, actorId, note };
    const balance =
      action === 'give'
        ? credit(tx, { ...entry, reason: 'admin_grant' })
        : debit(tx, { ...entry, reason: 'admin_take' });
    return { amount, balance };
  });
}
