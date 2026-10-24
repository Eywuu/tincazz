import type { ContainerBuilder } from 'discord.js';
import type { Db } from '../../db/index.js';
import { getOrCreateWallet } from '../economy/wallets.js';
import { parseBet } from './bet.js';
import { announcementCard, wagerCard } from './cards.js';
import { wager } from './config.js';
import type { Spin } from './index.js';
import { playWager } from './play.js';
import type { RandomInt } from './roll.js';

export interface SpinRequest {
  guildId: string;
  userId: string;
  /** Absent or blank means the default bet. */
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

export interface SettledSpin {
  played: Spin;
  /** Set only on a jackpot: whether the role could be assigned. */
  roleAssigned?: boolean;
}

/**
 * Settles one spin. Bet and funds errors propagate before anything is written; the jackpot role is
 * assigned only after the spin has committed.
 */
export async function settleSpin(
  db: Db,
  request: SpinRequest,
  now: number,
  options: SpinOptions,
): Promise<SettledSpin> {
  const { guildId, userId } = request;
  const bet = request.bet?.trim() || String(wager.defaultBet);

  const played = playWager(
    db,
    guildId,
    userId,
    parseBet(bet, getOrCreateWallet(db, guildId, userId, now).balance),
    now,
    options.randomInt,
  );

  const jackpot = played.evaluation.result === 'jackpot';
  const roleAssigned = jackpot ? await options.assignJackpotRole() : undefined;
  return { played, roleAssigned };
}

/** Settles one spin and builds its v2 card messages. */
export async function spin(
  db: Db,
  request: SpinRequest,
  now: number,
  options: SpinOptions,
): Promise<SpinMessages> {
  const { played, roleAssigned } = await settleSpin(db, request, now, options);
  const { userId } = request;
  const { result } = played.evaluation;
  const card = wagerCard(userId, played);
  const announced = result === 'triple' || result === 'jackpot';
  return announced
    ? { card, announcement: announcementCard(userId, played, roleAssigned) }
    : { card };
}
