import { container } from '@sapphire/framework';
import { eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { purgeWallet } from '../economy/prune.js';
import { logEconomy } from '../logs/send.js';
import { members } from './config.js';
import { markDeparted, markPresent } from './departures.js';

export interface ReconcileWallet {
  userId: string;
  departedAt: number | null;
}

export interface ReconcilePlan {
  depart: string[];
  restore: string[];
  purge: string[];
}

export function planReconcile(
  list: readonly ReconcileWallet[],
  memberIds: ReadonlySet<string>,
  now: number,
): ReconcilePlan {
  const plan: ReconcilePlan = { depart: [], restore: [], purge: [] };
  for (const wallet of list) {
    const present = memberIds.has(wallet.userId);
    if (wallet.departedAt === null) {
      if (!present) plan.depart.push(wallet.userId);
    } else if (present) {
      plan.restore.push(wallet.userId);
    } else if (now - wallet.departedAt >= members.graceMs) {
      plan.purge.push(wallet.userId);
    }
  }
  return plan;
}

export interface ReconcileGuild {
  id: string;
  memberCount: number;
  members: { fetch(): Promise<{ size: number; keys(): IterableIterator<string> }> };
}

export interface ReconcileResult {
  departed: number;
  restored: number;
  purged: string[];
  coinsRemoved: number;
}

/** Syncs wallets with the guild roster. Returns undefined, changing nothing, if the roster is unreliable. */
export async function reconcileGuild(
  db: Db,
  guild: ReconcileGuild,
  now: number,
): Promise<ReconcileResult | undefined> {
  let roster: Awaited<ReturnType<ReconcileGuild['members']['fetch']>>;
  try {
    roster = await guild.members.fetch();
  } catch (error) {
    container.logger.warn(`reconcile: could not fetch members of ${guild.id}`, error);
    return undefined;
  }
  if (guild.memberCount <= 0 || roster.size < members.minFetchRatio * guild.memberCount) {
    container.logger.warn(
      `reconcile: member fetch for ${guild.id} looks incomplete (${roster.size}/${guild.memberCount})`,
    );
    return undefined;
  }
  const memberIds = new Set(roster.keys());

  const result = db.transaction((tx) => {
    const list = tx
      .select({ userId: wallets.userId, departedAt: wallets.departedAt })
      .from(wallets)
      .where(eq(wallets.guildId, guild.id))
      .all();
    const plan = planReconcile(list, memberIds, now);
    for (const userId of plan.depart) markDeparted(tx, guild.id, userId, now);
    for (const userId of plan.restore) markPresent(tx, guild.id, userId);
    let coinsRemoved = 0;
    for (const userId of plan.purge) coinsRemoved += purgeWallet(tx, guild.id, userId, now);
    return {
      departed: plan.depart.length,
      restored: plan.restore.length,
      purged: plan.purge,
      coinsRemoved,
    };
  });

  if (result.departed || result.restored || result.purged.length) {
    void logEconomy(guild.id, { type: 'reconcile_summary', ...result });
  }
  return result;
}
