import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const ledgerReasons = [
  'start',
  'daily',
  'bailout',
  'chat',
  'free_prize', // legacy: free spins are gone, rows stay in history
  'bet',
  'payout',
  'pot_win',
  'admin_grant',
  'admin_take',
] as const;
// 'free' is legacy (free spins are gone); old rows keep it.
export const spinModes = ['free', 'wager'] as const;
export const spinResults = ['none', 'pair', 'triple', 'jackpot'] as const;

export type LedgerReason = (typeof ledgerReasons)[number];
export type SpinMode = (typeof spinModes)[number];
export type SpinResult = (typeof spinResults)[number];

export const wallets = sqliteTable(
  'wallets',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    balance: integer('balance').notNull(),
    dailyStreak: integer('daily_streak').notNull().default(0),
    lastDailyAt: integer('last_daily_at'),
    lastBailoutAt: integer('last_bailout_at'),
    lastChatRewardAt: integer('last_chat_reward_at'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
    check('wallets_balance_non_negative', sql`${table.balance} >= 0`),
    index('wallets_guild_balance_idx').on(table.guildId, table.balance),
  ],
);

export const ledger = sqliteTable(
  'ledger',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    delta: integer('delta').notNull(),
    balanceAfter: integer('balance_after').notNull(),
    reason: text('reason', { enum: ledgerReasons }).notNull(),
    ref: integer('ref'),
    actorId: text('actor_id'),
    note: text('note'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('ledger_user_idx').on(table.guildId, table.userId, table.id)],
);

export const spins = sqliteTable(
  'spins',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    mode: text('mode', { enum: spinModes }).notNull(),
    reels: text('reels').notNull(),
    result: text('result', { enum: spinResults }).notNull(),
    bet: integer('bet').notNull().default(0),
    payout: integer('payout').notNull().default(0),
    potWon: integer('pot_won').notNull().default(0),
    createdAt: integer('created_at').notNull(),
  },
  (table) => [index('spins_user_idx').on(table.guildId, table.userId)],
);

export const playerStats = sqliteTable(
  'player_stats',
  {
    guildId: text('guild_id').notNull(),
    userId: text('user_id').notNull(),
    spins: integer('spins').notNull().default(0),
    wins: integer('wins').notNull().default(0),
    jackpots: integer('jackpots').notNull().default(0),
    wagered: integer('wagered').notNull().default(0),
    won: integer('won').notNull().default(0),
    biggestWin: integer('biggest_win').notNull().default(0),
    bestOdds: integer('best_odds').notNull().default(0),
  },
  (table) => [
    primaryKey({ columns: [table.guildId, table.userId] }),
    index('player_stats_guild_biggest_win_idx').on(table.guildId, table.biggestWin),
    index('player_stats_guild_jackpots_idx').on(table.guildId, table.jackpots),
    index('player_stats_guild_spins_idx').on(table.guildId, table.spins),
  ],
);

export const pots = sqliteTable('pots', {
  guildId: text('guild_id').primaryKey(),
  amount: integer('amount').notNull(),
  lastWinnerId: text('last_winner_id'),
  lastWonAt: integer('last_won_at'),
});
