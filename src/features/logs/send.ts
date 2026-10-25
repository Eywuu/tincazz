import { container } from '@sapphire/framework';
import { type ContainerBuilder, MessageFlags } from 'discord.js';
import { logChannelId } from '../settings/store.js';
import { economyLogCard, modLogCard } from './cards.js';
import type { LogKind } from './config.js';
import type { EconomyEvent, ModEvent } from './events.js';

/** Posts a card to a channel. Never throws; returns false (and warns) on any problem. */
export async function sendLog(channelId: string, card: ContainerBuilder): Promise<boolean> {
  try {
    const channels = container.client.channels;
    const channel = channels.cache.get(channelId) ?? (await channels.fetch(channelId));
    if (!channel?.isSendable()) {
      container.logger.warn(`Log channel ${channelId} is missing or not sendable`);
      return false;
    }
    // No allowedMentions override: the client default (parse: []) keeps user text from pinging.
    await channel.send({ components: [card], flags: MessageFlags.IsComponentsV2 });
    return true;
  } catch (error) {
    container.logger.warn(`Could not send to log channel ${channelId}`, error);
    return false;
  }
}

async function deliver(guildId: string, kind: LogKind, build: () => ContainerBuilder) {
  try {
    const channelId = logChannelId(container.db, guildId, kind);
    if (!channelId) return;
    await sendLog(channelId, build());
  } catch (error) {
    container.logger.warn(`Could not log ${kind} event`, error);
  }
}

export function logEconomy(guildId: string, event: EconomyEvent, now = Date.now()): Promise<void> {
  return deliver(guildId, 'economy', () => economyLogCard(event, now));
}

export function logMod(guildId: string, event: ModEvent, now = Date.now()): Promise<void> {
  return deliver(guildId, 'mod', () => modLogCard(event, now));
}
