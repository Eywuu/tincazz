import { container } from '@sapphire/framework';
import { Events } from 'discord.js';
import { beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createClient } from '../src/client.js';
import { openDatabase } from '../src/db/index.js';
import { addAutoRole, autoRoles, setLogChannel } from '../src/features/settings/store.js';
import { testEnv } from './support/env.js';

let client: ReturnType<typeof createClient>;
let add: ReturnType<typeof vi.fn>;
let send: ReturnType<typeof vi.fn>;

beforeAll(async () => {
  client = createClient(testEnv);
  await client.stores.load();
});

beforeEach(() => {
  container.db = openDatabase(':memory:');
  container.logger = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as never;
  add = vi.fn(async () => ({}));
  send = vi.fn(async () => ({}));
  client.channels.cache.set('50', { id: '50', isSendable: () => true, send } as never);
  setLogChannel(container.db, '2', 'mod', '50', 1);
  addAutoRole(container.db, '2', '10', 'member', 1);
});

function member(pending: boolean) {
  return {
    pending,
    user: { id: '7', bot: false },
    guild: {
      id: '2',
      roles: { cache: new Map([['10', { id: '10', position: 2, managed: false }]]) },
      members: { me: { roles: { highest: { position: 10 } }, permissions: { has: () => true } } },
    },
    roles: { add },
  } as never;
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

it('assigns on join for a non-pending member', async () => {
  client.emit(Events.GuildMemberAdd, member(false));
  await settle();
  expect(add).toHaveBeenCalledWith(['10'], 'auto-role');
});

it('waits on join for a pending member', async () => {
  client.emit(Events.GuildMemberAdd, member(true));
  await settle();
  expect(add).not.toHaveBeenCalled();
});

it('assigns when screening completes', async () => {
  client.emit(Events.GuildMemberUpdate, member(true), member(false));
  await settle();
  expect(add).toHaveBeenCalledTimes(1);
});

it('ignores updates that do not complete screening', async () => {
  client.emit(Events.GuildMemberUpdate, member(false), member(false));
  await settle();
  expect(add).not.toHaveBeenCalled();
});

it('removes a deleted role from both lists and logs once', async () => {
  addAutoRole(container.db, '2', '5', 'member', 2);
  addAutoRole(container.db, '2', '5', 'bot', 2);
  client.emit(Events.GuildRoleDelete, { id: '5', guild: { id: '2' } } as never);
  await settle();
  expect(autoRoles(container.db, '2', 'member')).toEqual(['10']);
  expect(autoRoles(container.db, '2', 'bot')).toEqual([]);
  expect(send).toHaveBeenCalledTimes(1);
});
