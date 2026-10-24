import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/index.js';
import { wallets } from '../../db/schema.js';
import { chatReward } from './config.js';
import { credit } from './ledger.js';
import { getOrCreateWallet } from './wallets.js';

export interface ChatMessageLike {
  author: { bot: boolean };
  webhookId: string | null;
  system: boolean;
  guildId: string | null;
  content: string;
}

/** Real members chatting in a guild; bots, webhooks, system messages, DMs and commands earn nothing. */
export function isChatRewardable(message: ChatMessageLike, prefixes: readonly string[]): boolean {
  if (message.author.bot || message.webhookId !== null || message.system) {
    return false;
  }
  if (message.guildId === null) {
    return false;
  }
  return !prefixes.some((prefix) => prefix !== '' && message.content.startsWith(prefix));
}

/** Pays the chat reward, or returns null (writing nothing) while the cooldown is running. */
export function rewardChat(
  db: Db,
  guildId: string,
  userId: string,
  now: number,
): { amount: number; balance: number } | null {
  return db.transaction((tx) => {
    const wallet = getOrCreateWallet(tx, guildId, userId, now);
    if (wallet.lastChatRewardAt !== null && now < wallet.lastChatRewardAt + chatReward.cooldownMs) {
      return null;
    }
    const balance = credit(tx, { guildId, userId, amount: chatReward.amount, reason: 'chat', now });
    tx.update(wallets)
      .set({ lastChatRewardAt: now })
      .where(and(eq(wallets.guildId, guildId), eq(wallets.userId, userId)))
      .run();
    return { amount: chatReward.amount, balance };
  });
}
