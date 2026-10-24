import { vi } from 'vitest';
import type { createClient } from '../../src/client.js';

export interface ChatInputOptions {
  commandName: string;
  userId: string;
  guildId?: string;
  options?: Record<string, unknown>;
  subcommand?: string;
}

export function makeUser(id: string, bot = false) {
  return { id, bot, toString: () => `<@${id}>` };
}

/** An interaction stub for slash commands, in the style of the `/ping` test. */
export function makeChatInput(
  client: ReturnType<typeof createClient>,
  { commandName, userId, guildId = '2', options = {}, subcommand }: ChatInputOptions,
) {
  return {
    isChatInputCommand: () => true,
    isContextMenuCommand: () => false,
    isAutocomplete: () => false,
    isMessageComponent: () => false,
    isButton: () => false,
    isStringSelectMenu: () => false,
    isModalSubmit: () => false,
    isRepliable: () => true,
    commandName,
    commandId: '1',
    createdTimestamp: 1000,
    client,
    guildId,
    channelId: '3',
    user: makeUser(userId),
    replied: false,
    deferred: false,
    options: {
      getUser: (name: string) => (options[name] as never) ?? null,
      getInteger: (name: string) => (options[name] as number | undefined) ?? null,
      getString: (name: string) => (options[name] as string | undefined) ?? null,
      getSubcommand: () => subcommand ?? null,
    },
    reply: vi.fn(async () => ({})),
    editReply: vi.fn(),
  };
}
