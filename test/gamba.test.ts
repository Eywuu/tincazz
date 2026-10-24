import { describe, expect, it } from 'vitest';
import {
  formatGambaFollowUp,
  formatGambaReply,
  isJackpot,
  spinGamba,
  threeOfAKindOdds,
} from '../src/features/gamba/index.js';
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
  it('is just the reels', () => {
    expect(formatGambaReply(['a', 'b', 'c'])).toBe('a b c');
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

describe('threeOfAKindOdds', () => {
  it('is 1 in 343 for a yt emoji', () => {
    const yt = '<:gamba4Head:1202741378161840239>';
    expect(threeOfAKindOdds([yt, yt, yt])).toBe(343);
  });

  it('is 1 in 1158 for python (9261 / 8, rounded)', () => {
    const python = '<:python:1226479453039759410>';
    expect(threeOfAKindOdds([python, python, python])).toBe(1158);
  });

  it('is 1 in 9261 for cpp', () => {
    expect(threeOfAKindOdds([cppEmoji, cppEmoji, cppEmoji])).toBe(9261);
  });

  it('is undefined when the reels differ', () => {
    expect(threeOfAKindOdds([cppEmoji, cppEmoji, '<:python:1226479453039759410>'])).toBeUndefined();
  });
});

describe('formatGambaFollowUp', () => {
  const yt = '<:gamba4Head:1202741378161840239>';
  const cpp = [cppEmoji, cppEmoji, cppEmoji] as const;

  it('formats the odds of three of a kind as inline code', () => {
    expect(formatGambaFollowUp('<@1>', [yt, yt, yt])).toBe('`Odds: 1 in 343`');
  });

  it('is undefined when the reels differ', () => {
    expect(formatGambaFollowUp('<@1>', [yt, yt, cppEmoji])).toBeUndefined();
  });

  it('announces a jackpot winner above the odds', () => {
    expect(formatGambaFollowUp('<@1>', cpp, { roleAssigned: true })).toBe(
      '<@1> just won <@&1561827731400822845>\n`Odds: 1 in 9,261`',
    );
  });

  it('notes when the jackpot role could not be assigned', () => {
    expect(formatGambaFollowUp('<@1>', cpp, { roleAssigned: false })).toBe(
      "<@1> just won <@&1561827731400822845> (couldn't assign the role, tell a mod)\n`Odds: 1 in 9,261`",
    );
  });
});
