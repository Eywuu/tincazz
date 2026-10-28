import type { ContainerBuilder } from 'discord.js';
import { bailout, cashback, chatReward, collect, daily } from '../economy/config.js';
import { wager } from '../gamba/config.js';
import { accents, card, coins } from '../ui/index.js';

/**
 * The `/help` card. Every number comes from the feature configs so it cannot drift from the
 * rules; a test checks that each `misc` (game) command is listed.
 */
export function helpCard(prefix: string): ContainerBuilder {
  const bailoutMinutes = bailout.cooldownMs / 60_000;
  return card(
    accents.brand,
    '# Tincazz help',
    [
      '## Games',
      `\`/gamba\` & \`${prefix}gamba\`: spin the reels, e.g. \`${prefix}gamba 50\``,
      `\`/coinflip\` & \`${prefix}cf\`: flip against the bot or a member, e.g. \`${prefix}cf 100 tails\``,
      `\`/dice\` & \`${prefix}dice\`: call the roll of two dice, e.g. \`${prefix}dice =12 50\``,
    ].join('\n'),
    [
      '## Coins',
      `\`/daily\`: ${coins(daily.base)} coins plus a streak bonus, and ${cashback.percent}% cashback on yesterday's losses (up to ${coins(cashback.max)})`,
      `\`/collect\`: ${coins(collect.perHour)} coins per hour, stacking for up to ${collect.maxHours} hours`,
      `\`/bailout\`: a lifeline when you are almost broke, every ${bailoutMinutes} minutes`,
      `Chatting earns ${coins(chatReward.amount)} coins per message, at most once every ${chatReward.cooldownMs / 1000} seconds`,
      '`/balance`, `/stats` and `/leaderboard` show where you stand',
    ].join('\n'),
    [
      '## Bets',
      `${coins(wager.minBet)} to ${coins(wager.maxBet)}, all, half, 2.5k`,
      `Leave the bet out to wager ${coins(wager.defaultBet)}`,
    ].join('\n'),
  );
}
