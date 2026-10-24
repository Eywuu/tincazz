import { describe, expect, it, vi } from 'vitest';
import { rollOutcome } from '../src/features/gamba/roll.js';

const table = [
  { id: 'a', weight: 2 },
  { id: 'b', weight: 1 },
];

describe('rollOutcome', () => {
  it('maps draws onto cumulative weights', () => {
    expect(rollOutcome(table, () => 0).id).toBe('a');
    expect(rollOutcome(table, () => 1).id).toBe('a');
    expect(rollOutcome(table, () => 2).id).toBe('b');
  });

  it('draws from the total weight', () => {
    const randomInt = vi.fn(() => 0);
    rollOutcome(table, randomInt);
    expect(randomInt).toHaveBeenCalledTimes(1);
    expect(randomInt).toHaveBeenCalledWith(3);
  });

  it('throws on an empty table', () => {
    expect(() => rollOutcome([])).toThrow();
  });

  it('throws on a zero weight', () => {
    expect(() => rollOutcome([{ weight: 0 }])).toThrow();
  });

  it('throws on a non-integer weight', () => {
    expect(() => rollOutcome([{ weight: 1.5 }])).toThrow();
  });
});
