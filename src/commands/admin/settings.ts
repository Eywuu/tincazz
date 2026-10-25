import { Command } from '@sapphire/framework';
import {
  ChannelType,
  type ChatInputCommandInteraction,
  type GuildMember,
  InteractionContextType,
  PermissionFlagsBits,
} from 'discord.js';
import type { ModEvent } from '../../features/logs/events.js';
import { type LogKind, logKinds, logMod, modLogCard, sendLog } from '../../features/logs/index.js';
import {
  logChannelAlreadySet,
  logChannelProblem,
  type SettingsView,
  settingsCard,
  settingsNeedsManageServer,
} from '../../features/settings/index.js';
import { logChannelId, setLogChannel } from '../../features/settings/store.js';
import { accents, card, cardReply, errorReply } from '../../features/ui/index.js';

export class SettingsCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'settings', description: 'Configure the bot (admins)' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    const typeOption = (o: import('discord.js').SlashCommandStringOption) =>
      o
        .setName('type')
        .setDescription('Which log')
        .setRequired(true)
        .addChoices(...logKinds.map((k) => ({ name: k, value: k })));

    registry.registerChatInputCommand((builder) =>
      builder
        .setName(this.name)
        .setDescription(this.description)
        .setContexts(InteractionContextType.Guild)
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand((sub) => sub.setName('show').setDescription('Show the current settings'))
        .addSubcommandGroup((group) =>
          group
            .setName('logs')
            .setDescription('Log channels')
            .addSubcommand((sub) =>
              sub
                .setName('set')
                .setDescription('Send a log to a channel')
                .addStringOption(typeOption)
                .addChannelOption((o) =>
                  o
                    .setName('channel')
                    .setDescription('The channel')
                    .setRequired(true)
                    .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement),
                ),
            )
            .addSubcommand((sub) =>
              sub.setName('clear').setDescription('Stop sending a log').addStringOption(typeOption),
            ),
        ),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    // The default member permission can be widened in Server Settings -> Integrations.
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply(errorReply(settingsNeedsManageServer));
    }
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    if (group === 'logs' && sub === 'set') return this.logsSet(interaction);
    if (group === 'logs' && sub === 'clear') return this.logsClear(interaction);
    if (!group && sub === 'show') return this.show(interaction);
    return interaction.reply(errorReply('Unknown subcommand.'));
  }

  private async logsSet(interaction: ChatInputCommandInteraction) {
    const kind = interaction.options.getString('type', true) as LogKind;
    const channel = interaction.options.getChannel('channel', true) as unknown as Parameters<
      typeof logChannelProblem
    >[0] & { send(options: unknown): Promise<unknown> };
    const guildId = interaction.guildId as string;
    const me = interaction.guild?.members.me as GuildMember;

    if (logChannelId(this.container.db, guildId, kind) === channel.id) {
      return interaction.reply(errorReply(logChannelAlreadySet(kind, channel.id)));
    }
    const problem = logChannelProblem(channel, me);
    if (problem) return interaction.reply(errorReply(problem));

    try {
      await channel.send(
        cardReply(
          card(
            accents.brand,
            `This channel now receives ${kind} logs. Set by <@${interaction.user.id}>.`,
          ),
        ),
      );
    } catch (error) {
      this.container.logger.warn(`Could not confirm log channel ${channel.id}`, error);
      return interaction.reply(
        errorReply(`I couldn't post in <#${channel.id}>, so nothing changed.`),
      );
    }

    const now = Date.now();
    const previous = setLogChannel(this.container.db, guildId, kind, channel.id, now);
    await interaction.reply(
      cardReply(card(accents.brand, `Set the ${kind} log to <#${channel.id}>.`), {
        ephemeral: true,
      }),
    );

    const event: ModEvent = {
      type: 'log_channel_set',
      actorId: interaction.user.id,
      kind,
      fromChannelId: previous,
      toChannelId: channel.id,
    };
    void logMod(guildId, event, now);
    if (kind === 'mod' && previous) {
      void sendLog(previous, modLogCard(event, now));
    }
  }

  private async logsClear(interaction: ChatInputCommandInteraction) {
    const kind = interaction.options.getString('type', true) as LogKind;
    const guildId = interaction.guildId as string;
    const now = Date.now();
    if (!logChannelId(this.container.db, guildId, kind)) {
      return interaction.reply(errorReply(`The ${kind} log isn't set.`));
    }
    const previous = setLogChannel(this.container.db, guildId, kind, null, now) as string;
    await interaction.reply(
      cardReply(card(accents.brand, `Cleared the ${kind} log.`), { ephemeral: true }),
    );

    const event: ModEvent = {
      type: 'log_channel_cleared',
      actorId: interaction.user.id,
      kind,
      fromChannelId: previous,
    };
    if (kind === 'economy') {
      void logMod(guildId, event, now);
    } else {
      // The mod log is now unset, so logMod would find nothing: tell the old channel directly.
      void sendLog(previous, modLogCard(event, now));
    }
  }

  private async show(interaction: ChatInputCommandInteraction) {
    const guild = interaction.guild;
    const guildId = interaction.guildId as string;
    const logs = {} as SettingsView['logs'];
    for (const kind of logKinds) {
      const channelId = logChannelId(this.container.db, guildId, kind);
      let problem: string | undefined;
      if (channelId) {
        const channel = guild?.channels.cache.get(channelId);
        problem = channel
          ? logChannelProblem(channel as never, guild?.members.me as GuildMember)
          : 'channel no longer exists';
      }
      logs[kind] = { channelId, problem };
    }
    return interaction.reply(
      cardReply(settingsCard({ autoRoles: { member: [], bot: [] }, logs }), { ephemeral: true }),
    );
  }
}
