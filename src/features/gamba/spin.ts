import type { ContainerBuilder } from 'discord.js';
import type { Db } from '../../db/index.js';
import { getOrCreateWallet } from '../economy/wallets.js';
import { parseBet } from './bet.js';
import { announcementCard, freeSpinCard, wagerCard } from './cards.js';
import { playFree, playWager } from './play.js';
import type { RandomInt } from './roll.js';

export interface SpinRequest {
  guildId: string;
  userId: string;
  /** Absent or empty means a free spin. */
  bet?: string;
}

export interface SpinMessages {
  card: ContainerBuilder;
  announcement?: ContainerBuilder;
}

export interface SpinOptions {
  assignJackpotRole: () => Promise<boolean>;
  randomInt?: RandomInt;
}

/**
 * Settles one spin and builds its messages. Bet and funds errors propagate before anything is
 * written; the jackpot role is assigned only after the spin has committed.
 */
export async function spin(
  db: Db,
  request: SpinRequest,
  now: number,
  options: SpinOptions,
): Promise<SpinMessages> {
  const { guildId, userId } = request;
  const bet = request.bet?.trim();

  const played = bet
    ? playWager(
        db,
        guildId,
        userId,
        parseBet(bet, getOrCreateWallet(db, guildId, userId, now).balance),
        now,
        options.randomInt,
      )
    : playFree(db, guildId, userId, now, options.randomInt);

  const jackpot = played.evaluation.result === 'jackpot';
  const roleAssigned = jackpot ? await options.assignJackpotRole() : undefined;
  const { result } = played.evaluation;
  const card = played.mode === 'free' ? freeSpinCard(userId, played) : wagerCard(userId, played);
  const announced = result === 'triple' || result === 'jackpot';
  return announced
    ? { card, announcement: announcementCard(userId, played, roleAssigned) }
    : { card };
}
