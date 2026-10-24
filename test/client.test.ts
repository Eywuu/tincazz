import { describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';

const env = { DISCORD_TOKEN: 'x', COMMAND_PREFIX: '?', LOG_LEVEL: 'error' } as const;

describe('createClient', () => {
  it('registers the ping command and ready listener', async () => {
    const client = createClient(env);
    await client.stores.load();

    expect([...client.stores.get('commands').keys()]).toContain('ping');
    expect([...client.stores.get('listeners').keys()]).toContain('ready');
  });

  it('wires up prefix message commands', async () => {
    const client = createClient(env);
    await client.stores.load();

    // Without loadMessageCommandListeners, Sapphire never turns messages into command runs.
    expect([...client.stores.get('listeners').keys()]).toContain('CoreMessageCreate');
  });
});
