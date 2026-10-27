import { accents, card, coins, discordTime } from '../ui/index.js';
import type { AdminAction } from './admin.js';
import type { BailoutResult } from './bailout.js';
import type { CollectResult } from './collect.js';
import { bailout } from './config.js';
import type { DailyResult } from './daily.js';
import {
  AlreadyClaimedError,
  CollectNotReadyError,
  CooldownError,
  NotEligibleError,
} from './errors.js';

export const botsHaveNoWallets = "Bots don't have wallets.";

export const ecoNotAMember = (id: string) => `<@${id}> is not in this server.`;

export const ecoNeedsManageServer = 'You need the Manage Server permission to use `/eco`.';

export const ecoNeedsReason = 'Give a reason for the adjustment.';

export function balanceCard(userId: string, wallet: { balance: number; rank: number } | undefined) {
  if (!wallet) {
    return card(accents.brand, '## Balance', `<@${userId}> hasn't played yet.`);
  }
  return card(
    accents.brand,
    '## Balance',
    `<@${userId}> has **${coins(wallet.balance)}** coins`,
    `-# Rank #${wallet.rank} by coins`,
  );
}

export function dailyCard(result: DailyResult) {
  const unit = result.streak === 1 ? 'day' : 'days';
  return card(
    accents.win,
    '## Daily claimed',
    `+${coins(result.amount)} coins · streak ${result.streak} ${unit}`,
    ...(result.cashback > 0 ? [`+${coins(result.cashback)} cashback on yesterday's losses`] : []),
    `-# Balance: ${coins(result.balance)} · next claim ${discordTime(result.nextAt)}`,
  );
}

export function bailoutCard(result: BailoutResult) {
  return card(
    accents.win,
    '## Bailout',
    `+${coins(result.amount)} coins`,
    `-# Balance: ${coins(result.balance)}`,
  );
}

export function collectCard(result: CollectResult) {
  const unit = result.hours === 1 ? 'hour' : 'hours';
  return card(
    accents.win,
    '## Collected',
    `+${coins(result.amount)} coins · ${result.hours} ${unit} stacked`,
    `-# Balance: ${coins(result.balance)} · next coins ${discordTime(result.nextAt)} · full ${discordTime(result.fullAt)}`,
  );
}

/** User-facing text for an expected claim failure, or undefined for anything else. */
export function claimErrorText(error: unknown): string | undefined {
  if (error instanceof AlreadyClaimedError) {
    return `You already claimed today's daily. Next claim ${discordTime(error.nextAt)}.`;
  }
  if (error instanceof NotEligibleError) {
    return `Bailout is only for balances under ${bailout.belowBalance} coins. You have ${coins(error.balance)}.`;
  }
  if (error instanceof CollectNotReadyError) {
    return `Nothing to collect yet. Next coins ${discordTime(error.availableAt)}.`;
  }
  if (error instanceof CooldownError) {
    return `You already took a bailout. Next one ${discordTime(error.availableAt)}.`;
  }
  return undefined;
}

export function adminCard(
  action: AdminAction,
  userId: string,
  result: { amount: number; balance: number },
  reason: string,
) {
  const line =
    action === 'give'
      ? `Gave **${coins(result.amount)}** coins to <@${userId}>. New balance: ${coins(result.balance)}.`
      : `Took **${coins(result.amount)}** coins from <@${userId}>. New balance: ${coins(result.balance)}.`;
  return card(accents.brand, line, `-# Reason: ${reason}`);
}
