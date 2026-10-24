import { describe, expect, it } from 'vitest';
import { parseEnv } from '../src/config/env.js';

describe('parseEnv', () => {
  it('applies defaults when only the token is set', () => {
    expect(parseEnv({ DISCORD_TOKEN: 'abc' })).toEqual({
      DISCORD_TOKEN: 'abc',
      COMMAND_PREFIX: '?',
      LOG_LEVEL: 'info',
      DATABASE_PATH: './data/tincazz.db',
    });
  });

  it('treats empty optional values as unset', () => {
    const env = parseEnv({ DISCORD_TOKEN: 'abc', GUILD_ID: '', DATABASE_PATH: '' });
    expect(env.GUILD_ID).toBeUndefined();
    expect(env.DATABASE_PATH).toBe('./data/tincazz.db');
  });

  it('accepts a guild ID', () => {
    expect(parseEnv({ DISCORD_TOKEN: 'abc', GUILD_ID: '123456789012345678' }).GUILD_ID).toBe(
      '123456789012345678',
    );
  });

  it('rejects a guild ID that is not a snowflake', () => {
    expect(() => parseEnv({ DISCORD_TOKEN: 'abc', GUILD_ID: 'my-server' })).toThrow(/GUILD_ID/);
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
