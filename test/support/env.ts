import type { Env } from '../../src/config/env.js';

export const testEnv: Env = {
  DISCORD_TOKEN: 'x',
  COMMAND_PREFIX: '?',
  LOG_LEVEL: 'error',
  DATABASE_PATH: ':memory:',
};
