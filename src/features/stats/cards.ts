import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ContainerBuilder,
  SectionBuilder,
  StringSelectMenuBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
} from 'discord.js';
import type { DbOrTx } from '../../db/index.js';
import { accents, card, coins } from '../ui/index.js';
import { categoryLabels, type LeaderboardCategory, leaderboardCategories } from './config.js';
import { encodeCategoryId, encodePageId } from './custom-ids.js';
import { type LeaderboardPage, leaderboardPage, leaderboardRank } from './leaderboard.js';
import type { PlayerProfile } from './profile.js';

export const notYourLeaderboard =
  "This isn't your leaderboard. Use `/leaderboard` to get your own.";

const none = '—';
const medals = ['🥇', '🥈', '🥉'] as const;

function signed(amount: number): string {
  if (amount > 0) {
    return `+${coins(amount)}`;
  }
  return coins(amount);
}

export function profileCard(
  userId: string,
  avatarUrl: string,
  profile: PlayerProfile | undefined,
): ContainerBuilder {
  if (!profile) {
    return card(accents.brand, '## Stats', `<@${userId}> hasn't played yet.`);
  }
  const winRate =
    profile.spins === 0 ? none : `${((profile.wins / profile.spins) * 100).toFixed(1)}%`;
  const bestOdds = profile.bestOdds === 0 ? none : `1 in ${coins(profile.bestOdds)}`;
  const days = profile.dailyStreak === 1 ? 'day' : 'days';
  const header = new SectionBuilder()
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent('## Stats'),
      new TextDisplayBuilder().setContent(
        `<@${userId}> · **${coins(profile.balance)}** coins · rank #${profile.rank}`,
      ),
    )
    .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarUrl));
  return card(
    accents.brand,
    `Spins **${coins(profile.spins)}** · win rate **${winRate}** · jackpots **${coins(profile.jackpots)}**`,
    `Biggest win **${coins(profile.biggestWin)}** · best odds **${bestOdds}**`,
    `Net profit **${signed(profile.won - profile.wagered)}** · wagered ${coins(profile.wagered)} · won ${coins(profile.won)}`,
    `-# Daily streak: ${profile.dailyStreak} ${days}`,
  ).spliceComponents(0, 0, header);
}

export interface LeaderboardView {
  ownerId: string;
  category: LeaderboardCategory;
  board: LeaderboardPage;
  caller: { rank: number; value: number } | undefined;
}

export function leaderboardCard({
  ownerId,
  category,
  board,
  caller,
}: LeaderboardView): ContainerBuilder {
  const format = (value: number) => (category === 'profit' ? signed(value) : coins(value));
  const lines = board.rows.map((row) => {
    const place = medals[row.rank - 1] ?? `**${row.rank}.**`;
    return `${place} <@${row.userId}> · **${format(row.value)}**`;
  });
  const paged = board.pageCount > 1;
  const standing = caller
    ? `-# Your rank: #${caller.rank} · ${format(caller.value)}`
    : "-# You're not on this board yet";
  const footer = paged ? `${standing} · Page ${board.page + 1} of ${board.pageCount}` : standing;

  const select = new StringSelectMenuBuilder()
    .setCustomId(encodeCategoryId(ownerId))
    .setPlaceholder('Pick a board')
    .addOptions(
      leaderboardCategories.map((value) => ({
        label: categoryLabels[value],
        value,
        default: value === category,
      })),
    );
  const container = card(
    accents.brand,
    `## Leaderboard · ${categoryLabels[category]}`,
    lines.length > 0 ? lines.join('\n') : 'Nobody is on this board yet.',
    footer,
  ).addActionRowComponents(new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select));
  if (paged) {
    const button = (label: string, page: number, disabled: boolean) =>
      new ButtonBuilder()
        .setLabel(label)
        .setCustomId(encodePageId(ownerId, category, page))
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(disabled);
    container.addActionRowComponents(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        button('Previous', Math.max(0, board.page - 1), board.page === 0),
        button(
          'Next',
          Math.min(board.pageCount - 1, board.page + 1),
          board.page >= board.pageCount - 1,
        ),
      ),
    );
  }
  return container;
}

/** Queries one page of a board and the owner's rank, then builds the card. */
export function renderLeaderboard(
  db: DbOrTx,
  guildId: string,
  ownerId: string,
  category: LeaderboardCategory,
  page: number,
): ContainerBuilder {
  return leaderboardCard({
    ownerId,
    category,
    board: leaderboardPage(db, guildId, category, page),
    caller: leaderboardRank(db, guildId, category, ownerId),
  });
}
