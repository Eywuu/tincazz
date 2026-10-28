import { container } from '@sapphire/framework';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearBudgets, play, setFrameDelay, takeFrame } from '../src/features/animation/index.js';
import { card } from '../src/features/ui/index.js';

const json = (value: unknown) => JSON.stringify(value);
const result = card(0, 'the result');
const options = { channelId: 'c' };

describe('play', () => {
  beforeEach(() => {
    setFrameDelay(0);
    clearBudgets();
  });
  afterEach(() => {
    setFrameDelay(undefined);
    clearBudgets();
    vi.restoreAllMocks();
  });

  it('shows the first frame, then each other frame and the result as edits', async () => {
    const shown: string[] = [];
    const first = vi.fn(async (reply: unknown) => shown.push(`first ${json(reply)}`));
    const next = vi.fn(async (reply: unknown) => shown.push(`next ${json(reply)}`));
    const frames = [card(0, 'one'), card(0, 'two'), card(0, 'three')];

    await play({ first, next }, frames, result, options);

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

    await play({ first: async () => undefined, next }, frames, result, options);

    expect(next).toHaveBeenCalledTimes(2);
    expect(json(next.mock.calls.at(-1))).toContain('the result');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('propagates a failed first card or result when the display has no fallback', async () => {
    const frames = [card(0, 'one')];
    await expect(
      play(
        { first: async () => Promise.reject(new Error('down')), next: async () => undefined },
        frames,
        result,
        options,
      ),
    ).rejects.toThrow('down');
    await expect(
      play(
        { first: async () => undefined, next: async () => Promise.reject(new Error('gone')) },
        frames,
        result,
        options,
      ),
    ).rejects.toThrow('gone');
  });

  it('shows only the result when there are no frames', async () => {
    const first = vi.fn(async (_reply: unknown) => undefined);
    await play({ first, next: async () => undefined }, [], result, options);
    expect(json(first.mock.calls[0])).toContain('the result');
  });

  it('waits the frame delay between edits', async () => {
    setFrameDelay(20);
    const started = Date.now();
    await play(
      { first: async () => undefined, next: async () => undefined },
      [card(0, 'one'), card(0, 'two')],
      result,
      options,
    );
    expect(Date.now() - started).toBeGreaterThanOrEqual(35);
  });

  it('skips remaining frames once the channel budget is spent but still shows the result', async () => {
    for (let i = 0; i < 5; i++) {
      takeFrame('c');
    }
    const first = vi.fn(async (_reply: unknown) => undefined);
    const next = vi.fn(async (_reply: unknown) => undefined);

    await play(
      { first, next },
      [card(0, 'one'), card(0, 'two'), card(0, 'three')],
      result,
      options,
    );

    expect(first).toHaveBeenCalledTimes(1);
    expect(json(first.mock.calls[0])).toContain('one');
    expect(next).toHaveBeenCalledTimes(1);
    expect(json(next.mock.calls[0])).toContain('the result');
  });

  it('uses fallback with the result when first or the result edit throws', async () => {
    const error = vi.fn();
    container.logger = { error } as unknown as typeof container.logger;
    const fallback = vi.fn(async (_reply: unknown) => 'fell back');
    const frames = [card(0, 'one')];

    const viaResult = await play(
      {
        first: async () => undefined,
        next: async () => Promise.reject(new Error('gone')),
        fallback,
      },
      frames,
      result,
      options,
    );
    expect(viaResult).toBe('fell back');
    expect(fallback).toHaveBeenCalledTimes(1);
    expect(json(fallback.mock.calls[0])).toContain('the result');

    await play(
      {
        first: async () => Promise.reject(new Error('down')),
        next: async () => undefined,
        fallback,
      },
      frames,
      result,
      options,
    );
    expect(fallback).toHaveBeenCalledTimes(2);
    expect(json(fallback.mock.calls[1])).toContain('the result');
    expect(error).toHaveBeenCalledTimes(2);
  });
});
