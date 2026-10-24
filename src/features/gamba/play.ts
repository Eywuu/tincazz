import type { Db } from '../../db/index.js';
import { spins } from '../../db/schema.js';
import { credit } from '../economy/ledger.js';
import { getOrCreateWallet } from '../economy/wallets.js';
import { type Evaluation, evaluate } from './evaluate.js';
import { type Reels, spinGamba } from './index.js';
import type { RandomInt } from './roll.js';
import { recordFreeSpinStats } from './stats.js';

export interface FreeSpin {
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
    return { reels, evaluation, prize, balance, spinId };
  });
}
