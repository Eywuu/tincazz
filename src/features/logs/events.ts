import type { AutoRoleTarget, FlipMode, SpinResult } from '../../db/schema.js';
import type { AdminAction } from '../economy/admin.js';
import type { LogKind } from './config.js';

export type EconomyEvent =
  | {
      type: 'admin_adjust';
      actorId: string;
      userId: string;
      action: AdminAction;
      amount: number;
      reason: string;
      balance: number;
    }
  | {
      type: 'jackpot';
      userId: string;
      bet: number;
      payout: number;
      potWon: number;
      roleAssigned: boolean;
    }
  | { type: 'big_spin'; userId: string; bet: number; result: SpinResult; payout: number }
  | {
      type: 'big_roll';
      userId: string;
      bet: number;
      /** The call's label, e.g. `Exact 12`. */
      call: string;
      total: number;
      won: boolean;
      payout: number;
    }
  | {
      type: 'big_flip';
      mode: FlipMode;
      playerIds: string[];
      bet: number;
      winnerId?: string;
      rake: number;
    } // winnerId undefined: the bot won
  | { type: 'member_departed'; userId: string; balance: number; purgeAt: number }
  | { type: 'member_restored'; userId: string; balance: number }
  | {
      type: 'reconcile_summary';
      departed: number;
      restored: number;
      purged: string[];
      coinsRemoved: number;
    };

export type ModEvent =
  | {
      type: 'autorole_added' | 'autorole_removed';
      actorId: string;
      roleId: string;
      target: AutoRoleTarget;
    }
  | {
      type: 'log_channel_set';
      actorId: string;
      kind: LogKind;
      fromChannelId?: string;
      toChannelId: string;
    }
  | { type: 'log_channel_cleared'; actorId: string; kind: LogKind; fromChannelId: string }
  | {
      type: 'setting_auto_cleared';
      setting: 'autorole' | 'log_channel';
      id: string;
      detail: string;
    }
  | { type: 'autorole_failed'; userId: string; failures: { roleId: string; reason: string }[] };
