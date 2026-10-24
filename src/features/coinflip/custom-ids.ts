import { type FlipSide, flipSides } from '../../db/schema.js';
import { wager } from '../gamba/config.js';

export type ChallengeAction = 'accept' | 'decline' | 'cancel';

export interface FlipAgainId {
  kind: 'again';
  userId: string;
  bet: number;
  side: FlipSide;
}

export interface ChallengeId {
  kind: 'challenge';
  action: ChallengeAction;
  challengerId: string;
  /** Undefined for an open challenge. */
  opponentId: string | undefined;
  bet: number;
  side: FlipSide;
  /** Epoch milliseconds, always a whole number of seconds. */
  expiresAt: number;
}

export type CoinflipId = FlipAgainId | ChallengeId;

const prefix = 'cf';
const actions: readonly string[] = ['accept', 'decline', 'cancel'] satisfies ChallengeAction[];

export function encodeFlipAgainId({ userId, bet, side }: Omit<FlipAgainId, 'kind'>): string {
  return `${prefix}:again:${userId}:${bet}:${side}`;
}

export function encodeChallengeId(id: Omit<ChallengeId, 'kind'>): string {
  const seconds = Math.ceil(id.expiresAt / 1000).toString(36);
  return `${prefix}:${id.action}:${id.challengerId}:${id.opponentId ?? 0}:${id.bet}:${id.side}:${seconds}`;
}

const isSide = (value: string): value is FlipSide =>
  (flipSides as readonly string[]).includes(value);

function parseBet(raw: string): number | undefined {
  if (!/^\d{1,5}$/.test(raw)) {
    return undefined;
  }
  const bet = Number(raw);
  return bet >= wager.minBet && bet <= wager.maxBet ? bet : undefined;
}

export function decodeCoinflipId(customId: string): CoinflipId | undefined {
  const parts = customId.split(':');
  if (parts[0] !== prefix) {
    return undefined;
  }
  if (parts[1] === 'again') {
    return decodeAgain(parts);
  }
  return decodeChallenge(parts);
}

function decodeAgain(parts: string[]): FlipAgainId | undefined {
  if (parts.length !== 5) {
    return undefined;
  }
  const [, , userId = '', rawBet = '', side = ''] = parts;
  const bet = parseBet(rawBet);
  if (!/^\d{1,20}$/.test(userId) || bet === undefined || !isSide(side)) {
    return undefined;
  }
  return { kind: 'again', userId, bet, side };
}

function decodeChallenge(parts: string[]): ChallengeId | undefined {
  if (parts.length !== 7) {
    return undefined;
  }
  const [
    ,
    action = '',
    challengerId = '',
    rawOpponent = '',
    rawBet = '',
    side = '',
    rawExpiry = '',
  ] = parts;
  if (!actions.includes(action) || !/^\d{1,20}$/.test(challengerId) || !isSide(side)) {
    return undefined;
  }
  if (!/^\d{1,20}$/.test(rawOpponent) || !/^[0-9a-z]{1,9}$/.test(rawExpiry)) {
    return undefined;
  }
  const opponentId = rawOpponent === '0' ? undefined : rawOpponent;
  if (action === 'decline' && opponentId === undefined) {
    return undefined;
  }
  const bet = parseBet(rawBet);
  if (bet === undefined) {
    return undefined;
  }
  return {
    kind: 'challenge',
    action: action as ChallengeAction,
    challengerId,
    opponentId,
    bet,
    side,
    expiresAt: Number.parseInt(rawExpiry, 36) * 1000,
  };
}
