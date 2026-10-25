import { type Guild, PermissionFlagsBits, type Role } from 'discord.js';
import { dangerousPermissions } from './config.js';

export interface RoleFacts {
  id: string;
  guildId: string;
  position: number;
  managed: boolean;
  permissions: bigint;
}

export interface BotFacts {
  highest: number;
  canManageRoles: boolean;
}

export interface InvokerFacts {
  highest: number;
  isOwner: boolean;
}

/** Why the bot can't hand this role out, or undefined when it can. */
export function botCannotAssign(role: RoleFacts, bot: BotFacts): string | undefined {
  if (role.id === role.guildId) return "`@everyone` can't be an auto-role.";
  if (role.managed) return 'That role is managed by an integration.';
  if (!bot.canManageRoles) return 'I need the Manage Roles permission.';
  if (role.position >= bot.highest) return 'That role is at or above my highest role.';
  return undefined;
}

export function validateAutoRole(
  role: RoleFacts,
  bot: BotFacts,
  invoker: InvokerFacts,
): string | undefined {
  const botProblem = botCannotAssign(role, bot);
  if (botProblem) return botProblem;
  if (!invoker.isOwner && role.position >= invoker.highest) {
    return 'That role is at or above your highest role.';
  }
  if ((role.permissions & dangerousPermissions) !== 0n) {
    return "That role has moderator permissions, so it can't be an auto-role.";
  }
  return undefined;
}

export function roleFacts(role: Role): RoleFacts {
  return {
    id: role.id,
    guildId: role.guild.id,
    position: role.position,
    managed: role.managed,
    permissions: role.permissions.bitfield,
  };
}

export function botFacts(guild: Guild): BotFacts {
  const me = guild.members.me;
  if (!me) return { highest: -1, canManageRoles: false };
  return {
    highest: me.roles.highest.position,
    canManageRoles: me.permissions.has(PermissionFlagsBits.ManageRoles),
  };
}
