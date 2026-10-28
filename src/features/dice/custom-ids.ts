import { wager } from '../gamba/config.js';
import { type DiceCall, decodeCall, encodeCall } from './calls.js';

/** The Roll again button: the player and terms of the roll it repeats. */
export interface RollAgainId {
  kind: 'again';
  userId: string;
  bet: number;
  call: DiceCall;
}

const prefix = 'dc';

export function encodeRollAgainId({ userId, bet, call }: Omit<RollAgainId, 'kind'>): string {
  return `${prefix}:again:${userId}:${bet}:${encodeCall(call)}`;
}

function parseBet(raw: string): number | undefined {
  if (!/^\d{1,5}$/.test(raw)) {
    return undefined;
  }
  const bet = Number(raw);
  return bet >= wager.minBet && bet <= wager.maxBet ? bet : undefined;
}

/** Decodes a dice button ID, or undefined for anything that is not a valid one. */
export function decodeDiceId(customId: string): RollAgainId | undefined {
  const parts = customId.split(':');
  if (parts.length !== 5 || parts[0] !== prefix || parts[1] !== 'again') {
    return undefined;
  }
  const [, , userId = '', rawBet = '', rawCall = ''] = parts;
  const bet = parseBet(rawBet);
  const call = decodeCall(rawCall);
  if (!/^\d{1,20}$/.test(userId) || bet === undefined || call === undefined) {
    return undefined;
  }
  return { kind: 'again', userId, bet, call };
}
