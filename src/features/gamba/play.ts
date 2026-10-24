import type { Db } from '../../db/index.js';
import { spins } from '../../db/schema.js';
import { credit, debit } from '../economy/ledger.js';
import { getOrCreateWallet } from '../economy/wallets.js';
import { type Evaluation, evaluate } from './evaluate.js';
import { type Reels, spinGamba } from './index.js';
import { settlePot } from './pot.js';
import type { RandomInt } from './roll.js';
import { recordFreeSpinStats, recordWagerSpinStats } from './stats.js';

export interface FreeSpin {
  mode: 'free';
  reels: Reels;
  evaluation: Evaluation;
  prize: number;
  balance: number;
  spinId: number;
}

/** Rolls a free spin and settles it (wallet, spin row, prize, stats) in one transaction. */
export function playFree(
  db: Db,
  guildId: string,
  userId: string,
  now: number,
  randomInt?: RandomInt,
): FreeSpin {
  const reels = spinGamba(randomInt);
  const evaluation = evaluate(reels);
  const prize = evaluation.freePrize;

  return db.transaction((tx) => {
    const wallet = getOrCreateWallet(tx, guildId, userId, now);
    const { id: spinId } = tx
      .insert(spins)
      .values({
        guildId,
        userId,
        mode: 'free',
        reels: reels.join(','),
        result: evaluation.result,
        bet: 0,
        payout: prize,
        potWon: 0,
        createdAt: now,
      })
      .returning({ id: spins.id })
      .get();
    const balance =
      prize > 0
        ? credit(tx, { guildId, userId, amount: prize, reason: 'free_prize', now, ref: spinId })
        : wallet.balance;
    recordFreeSpinStats(tx, guildId, userId, evaluation);
    return { mode: 'free', reels, evaluation, prize, balance, spinId };
  });
}

export interface WagerSpin {
  mode: 'wager';
  reels: Reels;
  evaluation: Evaluation;
  bet: number;
  payout: number;
  potWon: number;
  balance: number;
  pot: number;
  spinId: number;
}

/**
 * Rolls a wagered spin and settles it (bet, payout, pot, spin row, stats) in one transaction.
 * `bet` must already be validated with `parseBet`; an unaffordable bet throws and changes nothing.
 */
export function playWager(
  db: Db,
  guildId: string,
  userId: string,
  bet: number,
  now: number,
  randomInt?: RandomInt,
): WagerSpin {
  const reels = spinGamba(randomInt);
  const evaluation = evaluate(reels);
  const payout = Math.floor((bet * evaluation.payoutBps) / 10_000);

  return db.transaction((tx) => {
    getOrCreateWallet(tx, guildId, userId, now);
    const { potWon, pot } = settlePot(
      tx,
      guildId,
      bet,
      evaluation.result === 'jackpot',
      userId,
      now,
    );
    const { id: spinId } = tx
      .insert(spins)
      .values({
        guildId,
        userId,
        mode: 'wager',
        reels: reels.join(','),
        result: evaluation.result,
        bet,
        payout,
        potWon,
        createdAt: now,
      })
      .returning({ id: spins.id })
      .get();
    let balance = debit(tx, { guildId, userId, amount: bet, reason: 'bet', now, ref: spinId });
    if (payout > 0) {
      balance = credit(tx, { guildId, userId, amount: payout, reason: 'payout', now, ref: spinId });
    }
    if (potWon > 0) {
      balance = credit(tx, {
        guildId,
        userId,
        amount: potWon,
        reason: 'pot_win',
        now,
        ref: spinId,
      });
    }
    recordWagerSpinStats(tx, guildId, userId, { evaluation, bet, payout, potWon });
    return { mode: 'wager', reels, evaluation, bet, payout, potWon, balance, pot, spinId };
  });
}
