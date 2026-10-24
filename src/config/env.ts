import { z } from 'zod';

const envSchema = z.object({
  DISCORD_TOKEN: z
    .string({ error: 'DISCORD_TOKEN is required' })
    .min(1, 'DISCORD_TOKEN is required'),
  COMMAND_PREFIX: z.string().min(1).default('?'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});

export type Env = z.infer<typeof envSchema>;

/** Validates raw environment variables, throwing a readable error listing every problem. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}`);
  }
  return result.data;
}
