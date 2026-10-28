import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { animation, clearBudgets, takeFrame } from '../src/features/animation/index.js';

describe('animation budget', () => {
  beforeEach(() => clearBudgets());
  afterEach(() => clearBudgets());

  it('takes 5 frames then refuses the 6th in the same instant', () => {
    const results = Array.from({ length: 6 }, () => takeFrame('c', 1_000));
    expect(results).toEqual([true, true, true, true, true, false]);
  });

  it('refills one token after 1,000 ms', () => {
    for (let i = 0; i < animation.budget.capacity; i++) {
      takeFrame('c', 0);
    }
    expect(takeFrame('c', 999)).toBe(false);
    expect(takeFrame('c', 1_000)).toBe(true);
    expect(takeFrame('c', 1_000)).toBe(false);
  });

  it('never exceeds capacity after a long idle', () => {
    takeFrame('c', 0);
    const results = Array.from({ length: 7 }, () => takeFrame('c', 10_000_000));
    expect(results.filter(Boolean)).toHaveLength(animation.budget.capacity);
  });

  it('channels have separate buckets', () => {
    for (let i = 0; i < animation.budget.capacity; i++) {
      takeFrame('a', 0);
    }
    expect(takeFrame('a', 0)).toBe(false);
    expect(takeFrame('b', 0)).toBe(true);
  });
});
