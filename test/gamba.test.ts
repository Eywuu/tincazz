import { describe, expect, it } from 'vitest';
import { formatGambaReply, isJackpot, spinGamba } from '../src/features/gamba/index.js';
import { cppEmoji, gambaOutcomes } from '../src/features/gamba/outcomes.js';
import { rollOutcome } from '../src/features/gamba/roll.js';

describe('gamba outcomes', () => {
  it('has the agreed odds', () => {
    const counts = new Map<string, number>();
    for (let draw = 0; draw < 21; draw++) {
      const { emoji } = rollOutcome(gambaOutcomes, () => draw);
      counts.set(emoji, (counts.get(emoji) ?? 0) + 1);
    }

    expect(gambaOutcomes).toHaveLength(8);
    for (const { emoji } of gambaOutcomes) {
      const expected = emoji.includes(':cpp:') ? 1 : emoji.includes(':python:') ? 2 : 3;
      expect(counts.get(emoji), emoji).toBe(expected);
    }
  });
});

describe('spinGamba', () => {
  it('spins three independent reels', () => {
    const draws = [0, 20, 18];
    expect(spinGamba(() => draws.shift() ?? -1)).toEqual([
      '<:gamba4Head:1202741378161840239>',
      '<:cpp:1226477956541448194>',
      '<:python:1226479453039759410>',
    ]);
  });
});

describe('formatGambaReply', () => {
  const reels = ['a', 'b', 'c'] as const;

  it('formats a normal spin', () => {
    expect(formatGambaReply('<@1>', reels)).toBe('<@1> GAMBA!\na b c');
  });

  it('formats a jackpot', () => {
    expect(formatGambaReply('<@1>', reels, { roleAssigned: true })).toBe(
      '<@1> GAMBA!\na b c\nJACKPOT! You won <@&1561827731400822845>',
    );
  });

  it('formats a jackpot without the role', () => {
    expect(formatGambaReply('<@1>', reels, { roleAssigned: false })).toBe(
      "<@1> GAMBA!\na b c\nJACKPOT! You won <@&1561827731400822845> (couldn't assign the role, tell a mod)",
    );
  });
});

describe('isJackpot', () => {
  it('is true for three cpp', () => {
    expect(isJackpot([cppEmoji, cppEmoji, cppEmoji])).toBe(true);
  });

  it('is false for two cpp and another emoji', () => {
    expect(isJackpot([cppEmoji, cppEmoji, '<:python:1226479453039759410>'])).toBe(false);
  });

  it('is false for three yt emojis', () => {
    const yt = '<:gamba4Head:1202741378161840239>';
    expect(isJackpot([yt, yt, yt])).toBe(false);
  });
});
