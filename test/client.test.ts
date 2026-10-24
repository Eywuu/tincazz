import { describe, expect, it } from 'vitest';
import { createClient } from '../src/client.js';
import { testEnv } from './support/env.js';

describe('createClient', () => {
  it('registers the ping and gamba commands and ready listener', async () => {
    const client = createClient(testEnv);
    await client.stores.load();

    expect([...client.stores.get('commands').keys()]).toContain('ping');
    expect([...client.stores.get('commands').keys()]).toContain('gamba');
    expect([...client.stores.get('listeners').keys()]).toContain('ready');
  });

  it('wires up prefix message commands', async () => {
    const client = createClient(testEnv);
    await client.stores.load();

    // Without loadMessageCommandListeners, Sapphire never turns messages into command runs.
    expect([...client.stores.get('listeners').keys()]).toContain('CoreMessageCreate');
  });

  it('does not ping anyone by default', () => {
    const client = createClient(testEnv);

    expect(client.options.allowedMentions).toEqual({ parse: [], repliedUser: false });
  });
});
