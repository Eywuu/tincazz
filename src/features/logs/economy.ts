import type { WagerSpin } from '../gamba/play.js';
import type { EconomyEvent } from './events.js';

/**
 * The economy log line a settled spin deserves, if any: only a jackpot. Ordinary bets, however
 * big, stay out of the log so it is about coins given and taken, not every rich player's spins.
 */
export function spinLogEvent(
  userId: string,
  played: WagerSpin,
  roleAssigned: boolean | undefined,
): EconomyEvent | undefined {
  if (played.evaluation.result !== 'jackpot') return undefined;
  return {
    type: 'jackpot',
    userId,
    bet: played.bet,
    payout: played.payout,
    potWon: played.potWon,
    roleAssigned: roleAssigned ?? false,
  };
}
