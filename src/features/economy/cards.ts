import { accents, card, coins, discordTime } from '../ui/index.js';
import type { BailoutResult } from './bailout.js';
import { bailout } from './config.js';
import type { DailyResult } from './daily.js';
import { AlreadyClaimedError, CooldownError, NotEligibleError } from './errors.js';

export const botsHaveNoWallets = "Bots don't have wallets.";

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

/** User-facing text for an expected claim failure, or undefined for anything else. */
export function claimErrorText(error: unknown): string | undefined {
  if (error instanceof AlreadyClaimedError) {
    return `You already claimed today's daily. Next claim ${discordTime(error.nextAt)}.`;
  }
  if (error instanceof NotEligibleError) {
    return `Bailout is only for balances under ${bailout.belowBalance} coins. You have ${coins(error.balance)}.`;
  }
  if (error instanceof CooldownError) {
    return `You already took a bailout. Next one ${discordTime(error.availableAt)}.`;
  }
  return undefined;
}
