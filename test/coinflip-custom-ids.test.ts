import { describe, expect, it } from 'vitest';
import {
  decodeCoinflipId,
  encodeChallengeId,
  encodeFlipAgainId,
  encodeRematchId,
} from '../src/features/coinflip/index.js';

describe('coinflip custom ids', () => {
  it('round-trips a flip again id', () => {
    const id = { userId: '123456789012345678', bet: 250, side: 'heads' } as const;
    expect(encodeFlipAgainId(id)).toBe('cf:again:123456789012345678:250:heads');
    expect(decodeCoinflipId(encodeFlipAgainId(id))).toEqual({ kind: 'again', ...id });
  });

  it('round-trips an open challenge', () => {
    const id = {
      action: 'accept',
      challengerId: '123456789012345678',
      opponentId: undefined,
      bet: 250,
      side: 'tails',
      expiresAt: 1_800_000_000_000,
    } as const;
    expect(decodeCoinflipId(encodeChallengeId(id))).toEqual({ kind: 'challenge', ...id });
  });

  it('round-trips a targeted challenge', () => {
    const id = {
      action: 'decline',
      challengerId: '1',
      opponentId: '2',
      bet: 10_000,
      side: 'heads',
      expiresAt: 60_000,
    } as const;
    expect(decodeCoinflipId(encodeChallengeId(id))).toEqual({ kind: 'challenge', ...id });
  });

  it('round-trips a rematch id', () => {
    const id = {
      challengerId: '123456789012345678',
      acceptorId: '876543210987654321',
      bet: 250,
      challengerSide: 'tails',
    } as const;
    expect(encodeRematchId(id)).toBe('cf:rematch:123456789012345678:876543210987654321:250:tails');
    expect(decodeCoinflipId(encodeRematchId(id))).toEqual({ kind: 'rematch', ...id });
  });

  it.each([
    'cf:rematch:1:2:100',
    'cf:rematch:1:2:100:heads:extra',
    'cf:rematch:1:1:100:heads',
    'cf:rematch:1:2:9:heads',
    'cf:rematch:1:2:10001:heads',
    'cf:rematch:1:2:1e3:heads',
    'cf:rematch:1:2:100:edge',
    'cf:rematch:x:2:100:heads',
    'cf:rematch:1::100:heads',
    'cf:rematch:123456789012345678901:2:100:heads',
  ])('rejects the rematch id %j', (customId) => {
    expect(decodeCoinflipId(customId)).toBeUndefined();
  });

  it('rounds expiry up to the second', () => {
    const encoded = encodeChallengeId({
      action: 'cancel',
      challengerId: '1',
      opponentId: '2',
      bet: 10,
      side: 'heads',
      expiresAt: 1_500,
    });
    expect(decodeCoinflipId(encoded)).toMatchObject({ expiresAt: 2_000 });
  });

  // A decline needs a named opponent, hence the 0 in the decline case.
  it.each([
    'cf:again:1:9:heads',
    'cf:again:1:10001:heads',
    'cf:again:1:10:edge',
    'cf:decline:1:0:10:heads:z',
    'cf:accept:1:2:10:heads:',
    'gamba:again:1:10',
    'cf:accept:1:2:10:heads:z:extra',
    'cf:nope:1:2:10:heads:z',
    'cf:accept:x:2:10:heads:z',
    '',
  ])('rejects %j', (customId) => {
    expect(decodeCoinflipId(customId)).toBeUndefined();
  });
});
