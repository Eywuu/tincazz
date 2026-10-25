import { and, asc, eq, or } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import {
  type AutoRoleTarget,
  autoRoleTargets,
  guildAutoRoles,
  guildSettings,
} from '../../db/schema.js';
import type { LogKind } from '../logs/config.js';
import { autoRoles as autoRoleConfig } from './config.js';

const columns = {
  economy: 'economyLogChannelId',
  mod: 'modLogChannelId',
} as const satisfies Record<LogKind, 'economyLogChannelId' | 'modLogChannelId'>;

export function logChannelId(db: DbOrTx, guildId: string, kind: LogKind): string | undefined {
  const row = db.select().from(guildSettings).where(eq(guildSettings.guildId, guildId)).get();
  return row?.[columns[kind]] ?? undefined;
}

/** Sets (or, with null, clears) a log channel and returns the previous one. */
export function setLogChannel(
  db: DbOrTx,
  guildId: string,
  kind: LogKind,
  channelId: string | null,
  now: number,
): string | undefined {
  const previous = logChannelId(db, guildId, kind);
  const column = columns[kind];
  db.insert(guildSettings)
    .values({ guildId, [column]: channelId, updatedAt: now })
    .onConflictDoUpdate({
      target: guildSettings.guildId,
      set: { [column]: channelId, updatedAt: now },
    })
    .run();
  return previous;
}

/** Clears a deleted channel from every guild and kind that pointed at it. */
export function clearChannelEverywhere(
  db: DbOrTx,
  channelId: string,
  now: number,
): { guildId: string; kind: LogKind }[] {
  const rows = db
    .select()
    .from(guildSettings)
    .where(
      or(
        eq(guildSettings.economyLogChannelId, channelId),
        eq(guildSettings.modLogChannelId, channelId),
      ),
    )
    .all();
  const cleared: { guildId: string; kind: LogKind }[] = [];
  for (const row of rows) {
    for (const kind of ['economy', 'mod'] as const) {
      if (row[columns[kind]] === channelId) {
        setLogChannel(db, row.guildId, kind, null, now);
        cleared.push({ guildId: row.guildId, kind });
      }
    }
  }
  return cleared;
}

export function autoRoles(db: DbOrTx, guildId: string, target: AutoRoleTarget): string[] {
  return db
    .select({ roleId: guildAutoRoles.roleId })
    .from(guildAutoRoles)
    .where(and(eq(guildAutoRoles.guildId, guildId), eq(guildAutoRoles.target, target)))
    .orderBy(asc(guildAutoRoles.createdAt), asc(guildAutoRoles.roleId))
    .all()
    .map((row) => row.roleId);
}

export function addAutoRole(
  db: DbOrTx,
  guildId: string,
  roleId: string,
  target: AutoRoleTarget,
  now: number,
): 'added' | 'exists' | 'full' {
  const current = autoRoles(db, guildId, target);
  if (current.includes(roleId)) return 'exists';
  if (current.length >= autoRoleConfig.maxPerTarget) return 'full';
  db.insert(guildAutoRoles).values({ guildId, roleId, target, createdAt: now }).run();
  return 'added';
}

export function removeAutoRole(
  db: DbOrTx,
  guildId: string,
  roleId: string,
  target: AutoRoleTarget,
): boolean {
  const result = db
    .delete(guildAutoRoles)
    .where(
      and(
        eq(guildAutoRoles.guildId, guildId),
        eq(guildAutoRoles.roleId, roleId),
        eq(guildAutoRoles.target, target),
      ),
    )
    .run();
  return result.changes > 0;
}

/** Removes a (deleted) role from every list and returns the targets it was on. */
export function removeRoleEverywhere(
  db: DbOrTx,
  guildId: string,
  roleId: string,
): AutoRoleTarget[] {
  const removed: AutoRoleTarget[] = [];
  for (const target of autoRoleTargets) {
    if (removeAutoRole(db, guildId, roleId, target)) removed.push(target);
  }
  return removed;
}
