import { describe, expect, it } from 'vitest';
import { flipCoin, flipRake, otherSide } from '../src/features/coinflip/index.js';

describe('flipRake', () => {
  it.each([
    [10, 1],
    [16, 1],
    [17, 1],
    [34, 2],
    [100, 6],
    [10_000, 600],
  ])('rake for %i is %i', (bet, rake) => {
    expect(flipRake(bet)).toBe(rake);
  });
});

describe('flipCoin', () => {
  it('flips heads on 0 and tails on 1', () => {
    expect(flipCoin(() => 0)).toBe('heads');
    expect(flipCoin(() => 1)).toBe('tails');
  });

  it('asks for a draw below 2', () => {
    const seen: number[] = [];
    flipCoin((max) => {
      seen.push(max);
      return 0;
    });
    expect(seen).toEqual([2]);
  });

  it('knows the other side', () => {
    expect(otherSide('heads')).toBe('tails');
    expect(otherSide('tails')).toBe('heads');
  });
});
