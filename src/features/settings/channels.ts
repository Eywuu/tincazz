import {
  ChannelType,
  type GuildMember,
  PermissionFlagsBits,
  type PermissionsBitField,
} from 'discord.js';

interface PostableChannel {
  id?: string;
  type: ChannelType;
  permissionsFor(me: GuildMember): Readonly<PermissionsBitField> | null;
}

/** Why the bot cannot use a channel for logs, or undefined when it can. */
export function logChannelProblem(
  channel: PostableChannel & { id: string },
  me: GuildMember,
): string | undefined {
  if (channel.type !== ChannelType.GuildText && channel.type !== ChannelType.GuildAnnouncement) {
    return 'Pick a text or announcement channel.';
  }
  const permissions = channel.permissionsFor(me);
  if (
    !permissions?.has(PermissionFlagsBits.ViewChannel) ||
    !permissions.has(PermissionFlagsBits.SendMessages)
  ) {
    return `I need View Channel and Send Messages in <#${channel.id}>.`;
  }
  return undefined;
}
