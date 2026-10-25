import { container } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { eq } from 'drizzle-orm';
import { jobRuns } from '../../db/schema.js';
import { scheduler } from './config.js';

export interface Job {
  name: string;
  everyMs: number;
  run(client: Client<true>, now: number): Promise<boolean>;
}

export function startJobs(client: Client<true>, jobs: readonly Job[]): () => void {
  const running = new Set<string>();

  const runJob = async (job: Job, now: number): Promise<void> => {
    if (running.has(job.name)) return;
    running.add(job.name);
    try {
      const last = container.db.select().from(jobRuns).where(eq(jobRuns.name, job.name)).get();
      if (last && now - last.lastRunAt < job.everyMs) return;
      const done = await job.run(client, now);
      if (done) {
        container.db
          .insert(jobRuns)
          .values({ name: job.name, lastRunAt: now })
          .onConflictDoUpdate({ target: jobRuns.name, set: { lastRunAt: now } })
          .run();
      } else {
        container.logger.warn(`scheduler: ${job.name} did not finish`);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      container.logger.warn(`scheduler: ${job.name} failed: ${message}`);
    } finally {
      running.delete(job.name);
    }
  };

  const tick = (): void => {
    const now = Date.now();
    for (const job of jobs) void runJob(job, now);
  };

  tick();
  const timer = setInterval(tick, scheduler.tickMs);
  timer.unref();
  return () => clearInterval(timer);
}
