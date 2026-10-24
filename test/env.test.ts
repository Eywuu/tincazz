import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('parseEnv', () => {
  it('applies defaults when only the token is set', () => {
    expect(parseEnv({ DISCORD_TOKEN: 'abc' })).toEqual({
      DISCORD_TOKEN: 'abc',
      COMMAND_PREFIX: '?',
      LOG_LEVEL: 'info',
    });
  });

  it('rejects a missing token', () => {
    expect(() => parseEnv({})).toThrow(/DISCORD_TOKEN/);
  });

  it('rejects an unknown log level', () => {
    expect(() => parseEnv({ DISCORD_TOKEN: 'abc', LOG_LEVEL: 'loud' })).toThrow(/LOG_LEVEL/);
  });

  it('treats an empty token as missing', () => {
    expect(() => parseEnv({ DISCORD_TOKEN: '' })).toThrow(/DISCORD_TOKEN/);
  });
});
