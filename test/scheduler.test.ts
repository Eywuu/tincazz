import { container } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openDatabase } from '../src/db/index.js';
import { jobRuns } from '../src/db/schema.js';
import { type Job, startJobs } from '../src/features/scheduler/index.js';

const client = {} as Client<true>;
const day = 86_400_000;
const hour = 3_600_000;

function row(name: string) {
  return container.db.select().from(jobRuns).where(eq(jobRuns.name, name)).get();
}

describe('scheduler', () => {
  let warn: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    container.db = openDatabase(':memory:');
    warn = vi.fn();
    container.logger = { warn } as unknown as typeof container.logger;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('runs a due job at start and records the run', async () => {
    const start = Date.now();
    const run = vi.fn(async () => true);
    const stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(row('a')?.lastRunAt).toBe(start);
    stop();
  });

  it('logs instead of rejecting when the job_runs read fails', async () => {
    container.db = {
      select: () => {
        throw new Error('db down');
      },
    } as unknown as typeof container.db;
    const run = vi.fn(async () => true);
    const stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('db down'));
    stop();
  });

  it('skips a job that ran within everyMs', async () => {
    container.db
      .insert(jobRuns)
      .values({ name: 'a', lastRunAt: Date.now() - 1000 })
      .run();
    const run = vi.fn(async () => true);
    const stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    await vi.advanceTimersByTimeAsync(hour);
    expect(run).not.toHaveBeenCalled();
    stop();
  });

  it('retries a failed run on the next tick', async () => {
    const run = vi.fn<Job['run']>().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    await vi.advanceTimersByTimeAsync(0);
    expect(run).toHaveBeenCalledTimes(1);
    expect(row('a')).toBeUndefined();
    await vi.advanceTimersByTimeAsync(hour);
    expect(run).toHaveBeenCalledTimes(2);
    expect(row('a')).toBeDefined();
    stop();
  });

  it('logs and survives a throwing job', async () => {
    const run = vi.fn(async () => {
      throw new Error('boom');
    });
    let stop = () => {};
    expect(() => {
      stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    }).not.toThrow();
    await vi.advanceTimersByTimeAsync(0);
    expect(row('a')).toBeUndefined();
    expect(warn).toHaveBeenCalledWith('scheduler: a failed: boom');
    stop();
  });

  it('never overlaps runs of the same job', async () => {
    let resolve: (value: boolean) => void = () => {};
    const run = vi.fn(
      () =>
        new Promise<boolean>((r) => {
          resolve = r;
        }),
    );
    const stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    await vi.advanceTimersByTimeAsync(2 * hour);
    expect(run).toHaveBeenCalledTimes(1);
    resolve(true);
    stop();
  });

  it('stop clears the timer', async () => {
    const run = vi.fn(async () => false);
    const stop = startJobs(client, [{ name: 'a', everyMs: day, run }]);
    await vi.advanceTimersByTimeAsync(0);
    stop();
    await vi.advanceTimersByTimeAsync(2 * hour);
    expect(run).toHaveBeenCalledTimes(1);
  });
});
