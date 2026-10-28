import type { BotFlip, ChallengeRequest, SettledChallenge } from '../coinflip/play.js';
import { callLabel } from '../dice/calls.js';
import type { Roll } from '../dice/play.js';
import type { WagerSpin } from '../gamba/play.js';
import { logThresholds } from './config.js';
import type { EconomyEvent } from './events.js';

/** The economy log line a settled spin deserves, if any: a jackpot, or a big bet or payout. */
export function spinLogEvent(
  userId: string,
  played: WagerSpin,
  roleAssigned: boolean | undefined,
): EconomyEvent | undefined {
  const { result } = played.evaluation;
  if (result === 'jackpot') {
    return {
      type: 'jackpot',
      userId,
      bet: played.bet,
      payout: played.payout,
      potWon: played.potWon,
      roleAssigned: roleAssigned ?? false,
    };
  }
  if (played.bet >= logThresholds.bigSpin || played.payout >= logThresholds.bigSpin) {
    return { type: 'big_spin', userId, bet: played.bet, result, payout: played.payout };
  }
  return undefined;
}

/** The economy log line a settled dice roll deserves, if any: a big bet or payout. */
export function rollLogEvent(userId: string, roll: Roll): EconomyEvent | undefined {
  if (roll.bet < logThresholds.bigRoll && roll.payout < logThresholds.bigRoll) return undefined;
  return {
    type: 'big_roll',
    userId,
    bet: roll.bet,
    call: callLabel(roll.call),
    total: roll.total,
    won: roll.won,
    payout: roll.payout,
  };
}

export function botFlipLogEvent(userId: string, flip: BotFlip): EconomyEvent | undefined {
  if (flip.bet < logThresholds.bigFlip) return undefined;
  return {
    type: 'big_flip',
    mode: 'bot',
    playerIds: [userId],
    bet: flip.bet,
    winnerId: flip.won ? userId : undefined,
    rake: flip.rake,
  };
}

export function challengeLogEvent(
  request: ChallengeRequest,
  settled: SettledChallenge,
): EconomyEvent | undefined {
  if (request.bet < logThresholds.bigFlip) return undefined;
  return {
    type: 'big_flip',
    mode: request.mode,
    playerIds: [request.challengerId, request.acceptorId],
    bet: request.bet,
    winnerId: settled.winnerId,
    rake: settled.rake,
  };
}
