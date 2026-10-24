import { describe, expect, it } from 'vitest';
import { isJackpot, spinGamba, threeOfAKindOdds } from '../src/features/gamba/index.js';
import { gambaOutcomes, outcomeEmoji, outcomeKeys } from '../src/features/gamba/outcomes.js';
import { rollOutcome } from '../src/features/gamba/roll.js';

describe('gamba outcomes', () => {
  it('has the agreed odds', () => {
    const counts = new Map<string, number>();
    for (let draw = 0; draw < 21; draw++) {
      const { key } = rollOutcome(gambaOutcomes, () => draw);
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(gambaOutcomes).toHaveLength(8);
    for (const { key } of gambaOutcomes) {
      const expected = key === 'cpp' ? 1 : key === 'python' ? 2 : 3;
      expect(counts.get(key), key).toBe(expected);
    }
  });

  it('has unique keys that match outcomeKeys', () => {
    const keys = gambaOutcomes.map(({ key }) => key);
    expect(new Set(keys).size).toBe(keys.length);
    expect([...keys].sort()).toEqual([...outcomeKeys].sort());
  });
});

describe('spinGamba', () => {
  it('spins three independent reels', () => {
    const draws = [0, 20, 18];
    expect(spinGamba(() => draws.shift() ?? -1)).toEqual(['head', 'cpp', 'python']);
  });
});

describe('outcomeEmoji', () => {
  it('looks up the display emoji', () => {
    expect(outcomeEmoji('cpp')).toBe('<:cpp:1226477956541448194>');
  });
});

describe('isJackpot', () => {
  it('is true for three cpp', () => {
    expect(isJackpot(['cpp', 'cpp', 'cpp'])).toBe(true);
  });

  it('is false for two cpp and another emoji', () => {
    expect(isJackpot(['cpp', 'cpp', 'python'])).toBe(false);
  });

  it('is false for three yt emojis', () => {
    const yt = 'head';
    expect(isJackpot([yt, yt, yt])).toBe(false);
  });
});

describe('threeOfAKindOdds', () => {
  it('is 1 in 343 for a yt emoji', () => {
    const yt = 'head';
    expect(threeOfAKindOdds([yt, yt, yt])).toBe(343);
  });

  it('is 1 in 1158 for python (9261 / 8, rounded)', () => {
    const python = 'python';
    expect(threeOfAKindOdds([python, python, python])).toBe(1158);
  });

  it('is 1 in 9261 for cpp', () => {
    expect(threeOfAKindOdds(['cpp', 'cpp', 'cpp'])).toBe(9261);
  });

  it('is undefined when the reels differ', () => {
    expect(threeOfAKindOdds(['cpp', 'cpp', 'python'])).toBeUndefined();
  });
});
