import { container } from '@sapphire/framework';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearChallenges,
  reopen,
  scheduleExpiry,
  tryClose,
} from '../src/features/coinflip/index.js';

describe('coinflip challenges', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearChallenges();
  });

  afterEach(() => {
    clearChallenges();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('closes once', () => {
    expect(tryClose('m')).toBe(true);
    expect(tryClose('m')).toBe(false);
  });

  it('reopens after a short acceptor', () => {
    tryClose('m');
    reopen('m');
    expect(tryClose('m')).toBe(true);
  });

  it('expires an open challenge', async () => {
    const onExpire = vi.fn(async () => undefined);
    scheduleExpiry('m', 60_000, onExpire);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpire).toHaveBeenCalledTimes(1);
    expect(tryClose('m')).toBe(false);
  });

  it('does not expire a challenge that was already accepted', async () => {
    const onExpire = vi.fn(async () => undefined);
    scheduleExpiry('m', 60_000, onExpire);
    tryClose('m');
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onExpire).not.toHaveBeenCalled();
  });

  it('logs and swallows a failed expiry edit', async () => {
    const warn = vi.fn();
    container.logger = { warn } as never;
    scheduleExpiry('m', 1_000, async () => Promise.reject(new Error('Unknown Message')));
    await vi.advanceTimersByTimeAsync(1_000);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('Unknown Message');
  });
});
