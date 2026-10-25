import { PermissionFlagsBits } from 'discord.js';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  type BotFacts,
  botCannotAssign,
  type InvokerFacts,
  type RoleFacts,
  validateAutoRole,
} from '../src/features/settings/autorole.js';
import { dangerousPermissions } from '../src/features/settings/config.js';

const role: RoleFacts = { id: '5', guildId: '2', position: 3, managed: false, permissions: 0n };
const bot: BotFacts = { highest: 10, canManageRoles: true };
const invoker: InvokerFacts = { highest: 8, isOwner: false };
const moderatorText = "That role has moderator permissions, so it can't be an auto-role.";

describe('validateAutoRole', () => {
  it('accepts a plain low role', () => {
    expect(validateAutoRole(role, bot, invoker)).toBeUndefined();
  });

  it('rejects @everyone', () => {
    expect(botCannotAssign({ ...role, id: '2' }, bot)).toBe("`@everyone` can't be an auto-role.");
  });

  it('rejects managed roles', () => {
    expect(validateAutoRole({ ...role, managed: true }, bot, invoker)).toBe(
      'That role is managed by an integration.',
    );
  });

  it('requires Manage Roles', () => {
    expect(validateAutoRole(role, { ...bot, canManageRoles: false }, invoker)).toBe(
      'I need the Manage Roles permission.',
    );
  });

  it('rejects roles at or above the bot', () => {
    expect(validateAutoRole({ ...role, position: 10 }, bot, { ...invoker, highest: 20 })).toBe(
      'That role is at or above my highest role.',
    );
  });

  it('rejects roles at or above the invoker', () => {
    expect(validateAutoRole({ ...role, position: 8 }, bot, invoker)).toBe(
      'That role is at or above your highest role.',
    );
  });

  it('lets the owner bypass the invoker check only', () => {
    const owner = { highest: 0, isOwner: true };
    expect(validateAutoRole({ ...role, position: 8 }, bot, owner)).toBeUndefined();
    expect(validateAutoRole({ ...role, position: 10 }, bot, owner)).toBe(
      'That role is at or above my highest role.',
    );
    expect(
      validateAutoRole({ ...role, permissions: PermissionFlagsBits.BanMembers }, bot, owner),
    ).toBe(moderatorText);
  });

  it('rejects moderator permissions', () => {
    expect(
      validateAutoRole({ ...role, permissions: PermissionFlagsBits.Administrator }, bot, invoker),
    ).toBe(moderatorText);
  });

  it('flags any dangerous permission, whatever else is set', () => {
    const flags = [
      PermissionFlagsBits.Administrator,
      PermissionFlagsBits.ManageGuild,
      PermissionFlagsBits.ManageRoles,
      PermissionFlagsBits.ManageChannels,
      PermissionFlagsBits.BanMembers,
      PermissionFlagsBits.KickMembers,
      PermissionFlagsBits.ManageMessages,
      PermissionFlagsBits.MentionEveryone,
      PermissionFlagsBits.ManageWebhooks,
      PermissionFlagsBits.ModerateMembers,
    ];
    fc.assert(
      fc.property(
        fc.subarray(flags, { minLength: 1 }),
        fc.bigInt({ min: 0n, max: (1n << 50n) - 1n }),
        (subset, other) => {
          const permissions = subset.reduce((acc, flag) => acc | flag, other);
          expect(validateAutoRole({ ...role, permissions }, bot, invoker)).toBe(moderatorText);
        },
      ),
    );
    expect(dangerousPermissions & PermissionFlagsBits.Administrator).not.toBe(0n);
  });
});
