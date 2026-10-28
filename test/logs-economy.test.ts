import { describe, expect, it } from 'vitest';
import type { WagerSpin } from '../src/features/gamba/play.js';
import { spinLogEvent } from '../src/features/logs/index.js';

const spinOf = (result: string, bet: number, payout: number): WagerSpin =>
  ({ bet, payout, potWon: 777, evaluation: { result } }) as unknown as WagerSpin;

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

  it.each([
    ['a max bet', spinOf('none', 10_000, 0)],
    ['a big payout', spinOf('triple', 10_000, 250_000)],
    ['a pot win on a pair', spinOf('pair', 10_000, 40_000)],
  ])('keeps %s out of the log', (_case, spin) => {
    expect(spinLogEvent('1', spin, undefined)).toBeUndefined();
  });
});
