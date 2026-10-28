import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type DiceCall,
  diceErrorText,
  dieFace,
  needsText,
  notYourRoll,
  type Roll,
  rollCard,
  rollFrames,
} from '../src/features/dice/index.js';
import { InsufficientFundsError } from '../src/features/economy/errors.js';
import { InvalidBetError, spinErrorText } from '../src/features/gamba/index.js';
import { accents } from '../src/features/ui/index.js';

const limits = { minBet: 10, maxBet: 10_000, defaultBet: 10 };

const json = (c: { toJSON(): unknown }) => JSON.stringify(c.toJSON());
const accent = (c: { toJSON(): { accent_color?: number | null } }) => c.toJSON().accent_color;
const buttonIds = (c: { toJSON(): unknown }) =>
  [...json(c).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]);
const texts = (c: { toJSON(): { components: object[] } }): string[] =>
  c
    .toJSON()
    .components.flatMap((component) =>
      'content' in component && typeof component.content === 'string' ? [component.content] : [],
    );

const roll = (extra: Partial<Roll> = {}): Roll => ({
  bet: 100,
  call: { kind: 'high' },
  die1: 6,
  die2: 2,
  total: 8,
  won: true,
  payout: 237,
  edge: 1,
  balance: 1_137,
  pot: 10_001,
  rollId: 1,
  ...extra,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('rollCard', () => {
  it('shows a win with the roll again button', () => {
    const c = rollCard('1', roll());
    expect(accent(c)).toBe(accents.win);
    expect(texts(c)).toEqual([
      '# 🎲 ⚅ ⚁ = 8 · HIGH ✓',
      'Called **High** · +137',
      '-# <@1> · balance 1,137 · pot 10,001',
    ]);
    expect(buttonIds(c)).toEqual(['dc:again:1:100:h']);
    expect(json(c)).toContain('Roll again');
  });

  it('shows a loss with an upper-cased exact call', () => {
    const call: DiceCall = { kind: 'exact', target: 9 };
    const c = rollCard(
      '1',
      roll({ call, die1: 1, die2: 2, total: 3, won: false, payout: 0, balance: 900 }),
    );
    expect(accent(c)).toBe(accents.loss);
    expect(texts(c)[0]).toBe('# 🎲 ⚀ ⚁ = 3 · EXACT 9 ✗');
    expect(texts(c)[1]).toBe('Called **Exact 9** · -100');
    expect(buttonIds(c)).toEqual(['dc:again:1:100:e9']);
  });
});

describe('rollFrames', () => {
  const faces = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

  it('has four frames with the caption second in each', () => {
    const frames = rollFrames('1', roll());
    expect(frames).toHaveLength(4);
    for (const frame of frames) {
      expect(texts(frame)[1]).toBe('<@1> called **High** · 100');
      expect(buttonIds(frame)).toEqual([]);
    }
  });

  it('tumbles two faces in the first two frames', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const frames = rollFrames('1', roll());
    for (const frame of frames.slice(0, 2)) {
      const title = texts(frame)[0] ?? '';
      expect(title).toBe('# 🎲 ⚃ ⚃');
      expect(texts(frame)[2]).toBe('-# tumbling');
    }
  });

  it('tumbles with real dice faces', () => {
    for (let i = 0; i < 20; i++) {
      const frame = rollFrames('1', roll())[0];
      if (frame === undefined) throw new Error('no frame');
      const found = [...(texts(frame)[0] ?? '')].filter((ch) => faces.includes(ch));
      expect(found).toHaveLength(2);
    }
  });

  it('shows the first die and a hidden second die in frame three', () => {
    const frame = rollFrames('1', roll())[2];
    if (frame === undefined) throw new Error('no frame');
    expect(texts(frame)[0]).toBe(`# 🎲 ${dieFace(6)} 🎲`);
    expect(texts(frame)[2]).toBe('-# first die down');
  });

  it('says what the first die needs in frame four', () => {
    const call: DiceCall = { kind: 'seven' };
    const frame = rollFrames('1', roll({ call, die1: 2 }))[3];
    if (frame === undefined) throw new Error('no frame');
    expect(json(frame)).toContain(needsText(call, 2));
  });

  it('never reveals the result', () => {
    for (const won of [true, false]) {
      for (const frame of rollFrames('1', roll({ won }))) {
        expect(json(frame)).not.toMatch(/✓|✗/);
        expect(json(frame)).not.toContain('= 8');
        expect(json(frame)).not.toContain('+137');
      }
    }
  });
});

describe('diceErrorText', () => {
  it('matches the spin error messages', () => {
    for (const error of [
      new InvalidBetError('range', '99999', limits),
      new InvalidBetError('format', 'abc', limits),
      new InsufficientFundsError(5, 10),
      new Error('other'),
    ]) {
      expect(diceErrorText(error)).toBe(spinErrorText(error));
    }
    expect(diceErrorText(new Error('other'))).toBeUndefined();
  });

  it('has a not-your-roll message', () => {
    expect(notYourRoll).toBe("This isn't your roll. Use `/dice` to roll your own.");
  });
});
