import { describe, expect, it } from 'vitest';
import type { BotFlip } from '../src/features/coinflip/play.js';
import type { WagerSpin } from '../src/features/gamba/play.js';
import { botFlipLogEvent, challengeLogEvent, spinLogEvent } from '../src/features/logs/index.js';

const spinOf = (result: string, bet: number, payout: number): WagerSpin =>
  ({ bet, payout, potWon: 777, evaluation: { result } }) as unknown as WagerSpin;

const flipOf = (bet: number, won: boolean): BotFlip => ({ bet, won, rake: 6 }) as BotFlip;

describe('spinLogEvent', () => {
  it('logs only the jackpot for a big jackpot bet', () => {
    expect(spinLogEvent('1', spinOf('jackpot', 10_000, 20_000), true)).toEqual({
      type: 'jackpot',
      userId: '1',
      bet: 10_000,
      payout: 20_000,
      potWon: 777,
      roleAssigned: true,
    });
  });

  it('treats an unknown role result as not assigned', () => {
    expect(spinLogEvent('1', spinOf('jackpot', 10, 10), undefined)).toMatchObject({
      roleAssigned: false,
    });
  });

  it('ignores a spin just under the threshold', () => {
    expect(spinLogEvent('1', spinOf('pair', 4_999, 4_999), undefined)).toBeUndefined();
  });

  it('logs a big bet', () => {
    expect(spinLogEvent('1', spinOf('none', 5_000, 0), undefined)).toMatchObject({
      type: 'big_spin',
      bet: 5_000,
    });
  });

  it('logs a big payout on a small bet', () => {
    expect(spinLogEvent('1', spinOf('triple', 100, 5_000), undefined)).toMatchObject({
      type: 'big_spin',
      payout: 5_000,
    });
  });
});

describe('botFlipLogEvent', () => {
  it('ignores 4,999 and logs 5,000', () => {
    expect(botFlipLogEvent('1', flipOf(4_999, true))).toBeUndefined();
    expect(botFlipLogEvent('1', flipOf(5_000, true))).toEqual({
      type: 'big_flip',
      mode: 'bot',
      playerIds: ['1'],
      bet: 5_000,
      winnerId: '1',
      rake: 6,
    });
  });

  it('leaves the winner empty when the bot won', () => {
    expect(botFlipLogEvent('1', flipOf(5_000, false))?.type).toBe('big_flip');
    expect(botFlipLogEvent('1', flipOf(5_000, false))).toMatchObject({ winnerId: undefined });
  });
});

describe('challengeLogEvent', () => {
  const settled = { winnerId: '3', rake: 9 } as never;
  const request = (bet: number) =>
    ({ mode: 'open', challengerId: '1', acceptorId: '3', bet }) as never;

  it('logs both players at 5,000 and not below', () => {
    expect(challengeLogEvent(request(4_999), settled)).toBeUndefined();
    expect(challengeLogEvent(request(5_000), settled)).toEqual({
      type: 'big_flip',
      mode: 'open',
      playerIds: ['1', '3'],
      bet: 5_000,
      winnerId: '3',
      rake: 9,
    });
  });
});
