import { eq } from 'drizzle-orm';
import type { DbOrTx } from '../../db/index.js';
import { pots } from '../../db/schema.js';
import { pot } from './config.js';

/** Coins a wager adds to the pot: a percentage of the bet, at least one. */
export function potContribution(bet: number): number {
  return Math.max(1, Math.floor((bet * pot.contributionPercent) / 100));
}

/** The part of the pot a jackpot pays: all of it from the full-share bet, scaled below. */
export function potShare(amount: number, bet: number): number {
  if (bet >= pot.fullShareBet) return amount;
  return Math.floor((amount * bet) / pot.fullShareBet);
}

/**
 * Adds the bet's contribution to the guild pot (creating it at the seed) and, on a jackpot,
 * pays out the share. The remainder is topped up to the seed. Does not touch wallets.
 */
export function settlePot(
  tx: DbOrTx,
  guildId: string,
  bet: number,
  jackpot: boolean,
  userId: string,
  now: number,
): { potWon: number; pot: number } {
  tx.insert(pots).values({ guildId, amount: pot.seed }).onConflictDoNothing().run();
  const current = tx.select().from(pots).where(eq(pots.guildId, guildId)).get();
  const afterContribution = (current?.amount ?? pot.seed) + potContribution(bet);

  if (!jackpot) {
    tx.update(pots).set({ amount: afterContribution }).where(eq(pots.guildId, guildId)).run();
    return { potWon: 0, pot: afterContribution };
  }

  const potWon = potShare(afterContribution, bet);
  const remaining = Math.max(pot.seed, afterContribution - potWon);
  tx.update(pots)
    .set({ amount: remaining, lastWinnerId: userId, lastWonAt: now })
    .where(eq(pots.guildId, guildId))
    .run();
  return { potWon, pot: remaining };
}

/** Adds coins to the guild pot (creating it at the seed) and returns the new amount. */
export function addToPot(tx: DbOrTx, guildId: string, amount: number): number {
  tx.insert(pots).values({ guildId, amount: pot.seed }).onConflictDoNothing().run();
  const current = tx.select().from(pots).where(eq(pots.guildId, guildId)).get();
  const next = (current?.amount ?? pot.seed) + amount;
  tx.update(pots).set({ amount: next }).where(eq(pots.guildId, guildId)).run();
  return next;
}
