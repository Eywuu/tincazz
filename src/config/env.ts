import { z } from 'zod';

/** An empty value (as in a `.env` copied from `.env.example`) counts as unset. */
const emptyAsUnset = (value: unknown) => (value === '' ? undefined : value);

const envSchema = z.object({
  DISCORD_TOKEN: z
    .string({ error: 'DISCORD_TOKEN is required' })
    .min(1, 'DISCORD_TOKEN is required'),
  COMMAND_PREFIX: z.string().min(1).default('?'),
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  DATABASE_PATH: z.preprocess(emptyAsUnset, z.string().min(1).default('./data/tincazz.db')),
  GUILD_ID: z.preprocess(
    emptyAsUnset,
    z
      .string()
      .regex(/^\d{17,20}$/, 'GUILD_ID must be a server ID')
      .optional(),
  ),
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
