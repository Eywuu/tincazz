import { describe, expect, it } from 'vitest';
import { type DiceCall, payoutBps, ways, wins } from '../src/features/dice/index.js';

const calls: DiceCall[] = [
  { kind: 'high' },
  { kind: 'low' },
  { kind: 'seven' },
  { kind: 'doubles' },
  ...[2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map((target): DiceCall => ({ kind: 'exact', target })),
];

describe('dice evaluate', () => {
  it('covers 14 calls', () => {
    expect(calls).toHaveLength(14);
  });

  for (const call of calls) {
    const name = call.kind === 'exact' ? `exact ${call.target}` : call.kind;
    it(`returns about 99% over all 36 rolls for ${name}`, () => {
      let totalBps = 0;
      let winning = 0;
      for (let die1 = 1; die1 <= 6; die1++) {
        for (let die2 = 1; die2 <= 6; die2++) {
          if (wins(call, die1, die2)) {
            winning++;
            totalBps += payoutBps(call);
          }
        }
      }
      expect(winning).toBe(ways(call));
      const returned = totalBps / 36 / 10_000;
      expect(returned).toBeGreaterThanOrEqual(0.985);
      expect(returned).toBeLessThanOrEqual(0.995);
      // Exactly 99% before any payout is floored to whole coins.
      expect(returned).toBeCloseTo(0.99, 12);
    });
  }
});
