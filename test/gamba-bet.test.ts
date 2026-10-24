import { describe, expect, it } from 'vitest';
import { InsufficientFundsError } from '../src/features/economy/errors.js';
import { InvalidBetError, parseBet } from '../src/features/gamba/bet.js';

function kindOf(input: string, balance: number): unknown {
  try {
    parseBet(input, balance);
  } catch (error) {
    expect(error).toBeInstanceOf(InvalidBetError);
    return (error as InvalidBetError).kind;
  }
  return undefined;
}

describe('parseBet', () => {
  it('parses plain numbers and k suffixes', () => {
    expect(parseBet('100', 5000)).toBe(100);
    expect(parseBet(' 250 ', 5000)).toBe(250);
    expect(parseBet('2.5k', 5000)).toBe(2500);
    expect(parseBet('2.5K', 5000)).toBe(2500);
    expect(parseBet('1k', 5000)).toBe(1000);
    expect(parseBet('10', 5000)).toBe(10);
    expect(parseBet('10000', 20_000)).toBe(10_000);
  });

  it('parses all and half', () => {
    expect(parseBet('all', 5000)).toBe(5000);
    expect(parseBet('all', 50_000)).toBe(10_000);
    expect(parseBet('half', 5000)).toBe(2500);
  });

  it.each(['lol', '', '-5', '1.5', '1,000', '1.2345k', 'k'])('rejects %j as format', (input) => {
    expect(kindOf(input, 5000)).toBe('format');
  });

  it('rejects out of range bets', () => {
    for (const input of ['9', '0', '10001', '11k']) {
      expect(kindOf(input, 50_000)).toBe('range');
    }
    expect(kindOf('half', 15)).toBe('range');
    expect(kindOf('half', 30_000)).toBe('range');
  });

  it('throws InsufficientFundsError when the balance cannot cover the bet', () => {
    expect(() => parseBet('6000', 5000)).toThrow(InsufficientFundsError);
    try {
      parseBet('6000', 5000);
    } catch (error) {
      expect(error).toMatchObject({ balance: 5000, needed: 6000 });
    }
    try {
      parseBet('all', 5);
    } catch (error) {
      expect(error).toMatchObject({ balance: 5, needed: 10 });
    }
    expect(() => parseBet('10', 0)).toThrow(InsufficientFundsError);
  });
});
