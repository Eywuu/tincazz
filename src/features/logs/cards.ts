import type { ContainerBuilder } from 'discord.js';
import { members } from '../members/config.js';
import { accents, card, coins } from '../ui/index.js';
import type { EconomyEvent, ModEvent } from './events.js';

function build(accent: number, title: string, lines: string[], now: number): ContainerBuilder {
  return card(accent, [`### ${title}`, ...lines, `-# <t:${Math.floor(now / 1000)}:f>`].join('\n'));
}

const mention = (id: string) => `<@${id}>`;

export function economyLogCard(event: EconomyEvent, now: number): ContainerBuilder {
  switch (event.type) {
    case 'admin_adjust':
      return build(
        accents.brand,
        event.action === 'give' ? 'Coins given' : 'Coins taken',
        [
          `${mention(event.actorId)} ${event.action === 'give' ? 'gave' : 'took'} ${coins(event.amount)} coins ${event.action === 'give' ? 'to' : 'from'} ${mention(event.userId)}`,
          `Reason: ${event.reason}`,
          `New balance: ${coins(event.balance)}`,
        ],
        now,
      );
    case 'jackpot':
      return build(
        accents.gold,
        'Jackpot',
        [
          `${mention(event.userId)} hit the jackpot with a ${coins(event.bet)} bet`,
          `Payout: ${coins(event.payout)} (pot ${coins(event.potWon)})`,
          event.roleAssigned ? 'Jackpot role assigned' : 'Jackpot role not assigned',
        ],
        now,
      );
    case 'big_spin':
      return build(
        event.payout > event.bet ? accents.win : accents.brand,
        'Big spin',
        [
          `${mention(event.userId)} bet ${coins(event.bet)} and got ${event.result}`,
          `Payout: ${coins(event.payout)}`,
        ],
        now,
      );
    case 'big_flip':
      return build(
        event.winnerId ? accents.win : accents.brand,
        'Big coinflip',
        [
          `${event.mode} for ${coins(event.bet)}: ${event.playerIds.map(mention).join(' vs ')}`,
          event.winnerId ? `Winner: ${mention(event.winnerId)}` : 'The bot won',
          `Rake: ${coins(event.rake)}`,
        ],
        now,
      );
    case 'member_departed':
      return build(
        accents.loss,
        'Member departed',
        [
          `${mention(event.userId)} left with ${coins(event.balance)} coins`,
          `Wallet purged <t:${Math.floor(event.purgeAt / 1000)}:R>`,
        ],
        now,
      );
    case 'member_restored':
      return build(
        accents.brand,
        'Member restored',
        [`${mention(event.userId)} returned, wallet restored with ${coins(event.balance)} coins`],
        now,
      );
    case 'reconcile_summary': {
      const listed =
        event.purged.length > members.maxListedPurges
          ? `Purged ${event.purged.length} wallets`
          : event.purged.length > 0
            ? `Purged: ${event.purged.map(mention).join(' ')}`
            : 'Purged: none';
      return build(
        event.purged.length > 0 ? accents.loss : accents.brand,
        'Member reconciliation',
        [
          `Departed: ${event.departed}, restored: ${event.restored}`,
          listed,
          `Coins removed: ${coins(event.coinsRemoved)}`,
        ],
        now,
      );
    }
  }
}

export function modLogCard(event: ModEvent, now: number): ContainerBuilder {
  switch (event.type) {
    case 'autorole_added':
    case 'autorole_removed':
      return build(
        accents.brand,
        event.type === 'autorole_added' ? 'Auto-role added' : 'Auto-role removed',
        [
          `${mention(event.actorId)} ${event.type === 'autorole_added' ? 'added' : 'removed'} <@&${event.roleId}> for ${event.target}`,
        ],
        now,
      );
    case 'log_channel_set':
      return build(
        accents.brand,
        'Log channel set',
        [
          `${mention(event.actorId)} set the ${event.kind} log to <#${event.toChannelId}>`,
          ...(event.fromChannelId ? [`Previously <#${event.fromChannelId}>`] : []),
        ],
        now,
      );
    case 'log_channel_cleared':
      return build(
        accents.brand,
        'Log channel cleared',
        [`${mention(event.actorId)} cleared the ${event.kind} log (was <#${event.fromChannelId}>)`],
        now,
      );
    case 'setting_auto_cleared':
      return build(
        accents.loss,
        'Setting cleared automatically',
        [
          `${event.setting === 'autorole' ? `Auto-role <@&${event.id}>` : `Log channel <#${event.id}>`} was removed`,
          event.detail,
        ],
        now,
      );
    case 'autorole_failed':
      return build(
        accents.error,
        'Auto-role failed',
        [
          `Could not give roles to ${mention(event.userId)}`,
          ...event.failures.map((f) => `<@&${f.roleId}>: ${f.reason}`),
        ],
        now,
      );
  }
}
