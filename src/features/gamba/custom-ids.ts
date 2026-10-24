import { wager } from './config.js';

export type SpinAction = 'again' | 'double';

export interface SpinButtonId {
  action: SpinAction;
  userId: string;
  /** The bet the click will play: 0 is a free spin, and a Double ID already holds twice the bet. */
  bet: number;
}

const prefix = 'gamba';

export function encodeSpinId({ action, userId, bet }: SpinButtonId): string {
  return `${prefix}:${action}:${userId}:${bet}`;
}

export function decodeSpinId(customId: string): SpinButtonId | undefined {
  const parts = customId.split(':');
  if (parts.length !== 4) {
    return undefined;
  }
  const [head, action, userId, rawBet] = parts as [string, string, string, string];
  if (head !== prefix || (action !== 'again' && action !== 'double')) {
    return undefined;
  }
  if (!/^\d{1,20}$/.test(userId) || !/^\d+$/.test(rawBet)) {
    return undefined;
  }
  const bet = Number(rawBet);
  if (bet !== 0 && (bet < wager.minBet || bet > wager.maxBet)) {
    return undefined;
  }
  if (action === 'double' && bet === 0) {
    return undefined;
  }
  return { action, userId, bet };
}
