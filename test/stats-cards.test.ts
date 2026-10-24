import { describe, expect, it } from 'vitest';
import {
  type LeaderboardPage,
  leaderboardCard,
  type PlayerProfile,
  profileCard,
} from '../src/features/stats/index.js';

const json = (card: { toJSON(): unknown }) => JSON.stringify(card.toJSON());

const profile: PlayerProfile = {
  balance: 12_345,
  rank: 3,
  dailyStreak: 3,
  spins: 120,
  wins: 42,
  jackpots: 1,
  wagered: 10_000,
  won: 11_200,
  biggestWin: 4_500,
  bestOdds: 343,
};

describe('profileCard', () => {
  it('says a player without a wallet has not played', () => {
    expect(json(profileCard('1', 'https://cdn/a.png', undefined))).toContain(
      "<@1> hasn't played yet.",
    );
  });

  it('shows every stat line and the avatar', () => {
    const text = json(profileCard('1', 'https://cdn/a.png', profile));
    for (const line of [
      '## Stats',
      '<@1> · **12,345** coins · rank #3',
      'Spins **120** · win rate **35.0%** · jackpots **1**',
      'Biggest win **4,500** · best odds **1 in 343**',
      'Net profit **+1,200** · wagered 10,000 · won 11,200',
      '-# Daily streak: 3 days',
      'https://cdn/a.png',
    ]) {
      expect(text).toContain(line);
    }
  });

  it('shows dashes instead of NaN for a player with no spins', () => {
    const text = json(
      profileCard('1', 'https://cdn/a.png', {
        ...profile,
        spins: 0,
        wins: 0,
        bestOdds: 0,
        wagered: 0,
        won: 0,
        dailyStreak: 1,
      }),
    );
    expect(text).toContain('win rate **—**');
    expect(text).toContain('best odds **—**');
    expect(text).toContain('Net profit **0**');
    expect(text).toContain('1 day');
    expect(text).not.toContain('1 days');
    expect(text).not.toContain('NaN');
  });

  it('shows a negative net profit with a minus', () => {
    expect(
      json(profileCard('1', 'https://cdn/a.png', { ...profile, wagered: 400, won: 50 })),
    ).toContain('**-350**');
  });
});

const board = (rows: [string, number][], page: number, pageCount: number): LeaderboardPage => ({
  rows: rows.map(([userId, value], index) => ({ userId, value, rank: page * 10 + index + 1 })),
  page,
  pageCount,
});

describe('leaderboardCard', () => {
  it('lists a one page board with the caller rank and no paging', () => {
    const text = json(
      leaderboardCard({
        ownerId: '1',
        category: 'coins',
        board: board(
          [
            ['2', 900],
            ['1', 500],
            ['3', 100],
          ],
          0,
          1,
        ),
        caller: { rank: 2, value: 500 },
      }),
    );
    expect(text).toContain('## Leaderboard · Coins');
    expect(text).toContain('🥇 <@2> · **900**');
    expect(text).toContain('🥈 <@1> · **500**');
    expect(text).toContain('🥉 <@3> · **100**');
    expect(text).toContain('-# Your rank: #2 · 500');
    expect(text).not.toContain('Page 1');
    expect(text).not.toContain('Previous');
    expect(text).toContain('lb:cat:1');
    expect(text.match(/"value":"(coins|biggest-win|jackpots|profit|spins)"/g)).toHaveLength(5);
    expect(text).toMatch(/"value":"coins"[^}]*"default":true|"default":true[^}]*"value":"coins"/);
  });

  it('pages a middle page with signed profit values', () => {
    const text = json(
      leaderboardCard({
        ownerId: '1',
        category: 'profit',
        board: board([['9', 200]], 1, 3),
        caller: undefined,
      }),
    );
    expect(text).toContain('**11.** <@9> · **+200**');
    expect(text).toContain('Page 2 of 3');
    expect(text).toContain('lb:page:1:profit:0');
    expect(text).toContain('lb:page:1:profit:2');
    expect(text).not.toContain('"disabled":true');
  });

  it('disables Previous on the first page and Next on the last', () => {
    const first = leaderboardCard({
      ownerId: '1',
      category: 'spins',
      board: board([['9', 5]], 0, 2),
      caller: undefined,
    }).toJSON();
    const last = leaderboardCard({
      ownerId: '1',
      category: 'spins',
      board: board([['9', 5]], 1, 2),
      caller: undefined,
    }).toJSON();
    const buttons = (card: typeof first) =>
      JSON.stringify(card).match(/\{[^{}]*"custom_id":"lb:page[^{}]*\}/g) ?? [];
    const [prev, next] = buttons(first);
    expect(prev).toContain('"disabled":true');
    expect(next).not.toContain('"disabled":true');
    const [prev2, next2] = buttons(last);
    expect(prev2).not.toContain('"disabled":true');
    expect(next2).toContain('"disabled":true');
  });

  it('explains an empty board and a caller who is not on it', () => {
    const text = json(
      leaderboardCard({
        ownerId: '1',
        category: 'jackpots',
        board: board([], 0, 1),
        caller: undefined,
      }),
    );
    expect(text).toContain('Nobody is on this board yet.');
    expect(text).toContain("You're not on this board yet");
  });
});
