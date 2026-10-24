import { describe, expect, it } from 'vitest';
import {
  formatGambaFollowUp,
  formatGambaReply,
  isJackpot,
  spinGamba,
  threeOfAKindOdds,
} from '../src/features/gamba/index.js';
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

describe('formatGambaReply', () => {
  it('is the three emojis', () => {
    expect(formatGambaReply(['head', 'cpp', 'python'])).toBe(
      '<:gamba4Head:1202741378161840239> <:cpp:1226477956541448194> <:python:1226479453039759410>',
    );
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

describe('formatGambaFollowUp', () => {
  const yt = 'head';
  const python = 'python';
  const cpp = ['cpp', 'cpp', 'cpp'] as const;
  const gif = 'https://klipy.com/gifs/smol-smolcat-5';
  const prize = (amount: number, balance: number) => ({ amount, balance });

  it('congratulates any three of a kind and shows the odds', () => {
    expect(formatGambaFollowUp('<@1>', [yt, yt, yt], prize(50, 1_050))).toBe(
      '<@1> won!\n+50 coins (balance: 1,050)\n`Odds: 1 in 343`',
    );
  });

  it('is undefined when the reels differ', () => {
    expect(formatGambaFollowUp('<@1>', [yt, yt, 'cpp'], prize(0, 1_000))).toBeUndefined();
  });

  it('adds the gif for three pythons', () => {
    expect(formatGambaFollowUp('<@1>', [python, python, python], prize(500, 1_500))).toBe(
      `<@1> won!\n+500 coins (balance: 1,500)\n\`Odds: 1 in 1,158\`\n${gif}`,
    );
  });

  it('tells a cpp winner they are a pro and adds the gif', () => {
    expect(formatGambaFollowUp('<@1>', cpp, prize(2_500, 3_500), { roleAssigned: true })).toBe(
      `<@1> won!\nYou are a pro! You just won <@&1561827731400822845>\n+2,500 coins (balance: 3,500)\n\`Odds: 1 in 9,261\`\n${gif}`,
    );
  });

  it('notes when the pro role could not be assigned', () => {
    expect(formatGambaFollowUp('<@1>', cpp, prize(2_500, 3_500), { roleAssigned: false })).toBe(
      `<@1> won!\nYou are a pro! You just won <@&1561827731400822845> (couldn't assign the role, tell a mod)\n+2,500 coins (balance: 3,500)\n\`Odds: 1 in 9,261\`\n${gif}`,
    );
  });
});
