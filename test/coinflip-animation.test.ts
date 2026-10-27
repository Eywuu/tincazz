import { container } from '@sapphire/framework';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  animate,
  botFlipFrames,
  challengeFlipFrames,
  flipAnimation,
  flippingCard,
  setFrameDelay,
} from '../src/features/coinflip/index.js';
import { card } from '../src/features/ui/index.js';

const json = (value: unknown) => JSON.stringify(value);
const result = card(0, 'the result');

describe('flip animation', () => {
  beforeEach(() => setFrameDelay(0));
  afterEach(() => {
    setFrameDelay(undefined);
    vi.restoreAllMocks();
  });

  it('shows the first frame, then each other frame and the result as edits', async () => {
    const shown: string[] = [];
    const first = vi.fn(async (reply: unknown) => shown.push(`first ${json(reply)}`));
    const next = vi.fn(async (reply: unknown) => shown.push(`next ${json(reply)}`));
    const frames = [card(0, 'one'), card(0, 'two'), card(0, 'three')];

    await animate({ first, next }, frames, result);

    expect(shown).toHaveLength(4);
    expect(shown.map((line) => line.split(' ')[0])).toEqual(['first', 'next', 'next', 'next']);
    ['one', 'two', 'three', 'the result'].forEach((text, index) => {
      expect(shown[index]).toContain(text);
    });
  });

  it('cuts the animation short but still shows the result when a frame fails', async () => {
    const warn = vi.fn();
    container.logger = { warn } as unknown as typeof container.logger;
    const next = vi
      .fn(async (_reply: unknown) => undefined)
      .mockRejectedValueOnce(new Error('rate limited'));
    const frames = [card(0, 'one'), card(0, 'two'), card(0, 'three')];

    await animate({ first: async () => undefined, next }, frames, result);

    expect(next).toHaveBeenCalledTimes(2);
    expect(json(next.mock.calls.at(-1))).toContain('the result');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed first card or result for the caller to fall back on', async () => {
    const frames = [card(0, 'one')];
    await expect(
      animate(
        { first: async () => Promise.reject(new Error('down')), next: async () => undefined },
        frames,
        result,
      ),
    ).rejects.toThrow('down');
    await expect(
      animate(
        { first: async () => undefined, next: async () => Promise.reject(new Error('gone')) },
        frames,
        result,
      ),
    ).rejects.toThrow('gone');
  });

  it('shows only the result when there are no frames', async () => {
    const first = vi.fn(async (_reply: unknown) => undefined);
    await animate({ first, next: async () => undefined }, [], result);
    expect(json(first.mock.calls[0])).toContain('the result');
  });

  it('waits the frame delay between edits', async () => {
    setFrameDelay(20);
    const started = Date.now();
    await animate(
      { first: async () => undefined, next: async () => undefined },
      [card(0, 'one'), card(0, 'two')],
      result,
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });
});

describe('flipping cards', () => {
  it('alternate sides and carry no buttons', () => {
    const even = json(flippingCard(0, 'caption'));
    const odd = json(flippingCard(1, 'caption'));
    expect(even).toContain('Heads…');
    expect(odd).toContain('Tails…');
    for (const text of [even, odd]) {
      expect(text).toContain('caption');
      expect(text).not.toContain('"type":1,');
    }
  });

  it('build one frame per configured step for bot flips and challenges', () => {
    const bot = botFlipFrames('1', { bet: 2_500, side: 'tails' });
    expect(bot).toHaveLength(flipAnimation.frames);
    expect(json(bot[0])).toContain('<@1> called **Tails** · 2,500');

    const challenge = challengeFlipFrames(
      { challengerId: '1', opponentId: undefined, bet: 100, side: 'heads', expiresAt: 0 },
      '3',
    );
    expect(challenge).toHaveLength(flipAnimation.frames);
    expect(json(challenge[0])).toContain('<@1> vs <@3> · 100 each');
  });
});
