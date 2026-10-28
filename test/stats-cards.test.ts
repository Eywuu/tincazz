import { describe, expect, it } from 'vitest';
import {
  type LeaderboardPage,
  leaderboardCard,
  type PlayerProfile,
  profileCard,
  type RecentPlay,
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
  flips: 4,
  flipWins: 3,
  flipWagered: 400,
  flipWon: 582,
  rolls: 6,
  rollWins: 2,
  rollWagered: 600,
  rollWon: 474,
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
      'Coinflips **4** · won **3** · net **+182**',
      'Dice **6** · won **2** · net **-126**',
      '-# Daily streak: 3 days',
      'https://cdn/a.png',
    ]) {
      expect(text).toContain(line);
    }
  });

  it('omits the recent block when there are no recent plays', () => {
    expect(json(profileCard('1', 'https://cdn/a.png', profile))).not.toContain('### Recent');
    expect(json(profileCard('1', 'https://cdn/a.png', profile, []))).not.toContain('### Recent');
  });

  it('lists recent plays with signed nets and relative times', () => {
    const recent: RecentPlay[] = [
      { kind: 'flip', at: 1_700_000_123_456, net: 970, result: 'tails', opponentId: 'bob' },
      { kind: 'flip', at: 1_700_000_100_000, net: -100, result: 'heads' },
      { kind: 'roll', at: 1_700_000_050_000, net: -100, die1: 6, die2: 2, call: { kind: 'high' } },
      {
        kind: 'roll',
        at: 1_700_000_040_000,
        net: 450,
        die1: 3,
        die2: 6,
        call: { kind: 'exact', target: 9 },
      },
      { kind: 'roll', at: 1_700_000_030_000, net: 5, die1: 4, die2: 3, call: { kind: 'seven' } },
      { kind: 'roll', at: 1_700_000_020_000, net: 5, die1: 2, die2: 2, call: { kind: 'doubles' } },
    ];
    const text = json(profileCard('1', 'https://cdn/a.png', profile, recent));
    for (const line of [
      '### Recent',
      '🪙 Tails vs <@bob> · +970 · <t:1700000123:R>',
      '🪙 Heads · -100 · <t:1700000100:R>',
      '🎲 ⚅⚁ 8 high · -100 · <t:1700000050:R>',
      '🎲 ⚂⚅ 9 =9 · +450 · <t:1700000040:R>',
      '🎲 ⚃⚂ 7 seven · +5 · <t:1700000030:R>',
      '🎲 ⚁⚁ 4 doubles · +5 · <t:1700000020:R>',
    ]) {
      expect(text).toContain(line);
    }
  });

  it('does not show recent plays for a player without a wallet', () => {
    const recent: RecentPlay[] = [{ kind: 'flip', at: 0, net: 1, result: 'heads' }];
    expect(json(profileCard('1', 'https://cdn/a.png', undefined, recent))).not.toContain('Recent');
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
    expect(
      text.match(/"value":"(coins|biggest-win|jackpots|profit|spins|coinflip|dice)"/g),
    ).toHaveLength(7);
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

  it('shows signed coinflip net values', () => {
    const text = json(
      leaderboardCard({
        ownerId: '1',
        category: 'coinflip',
        board: board([['9', 94]], 0, 1),
        caller: undefined,
      }),
    );
    expect(text).toContain('<@9> · **+94**');
  });

  it('shows signed dice net values', () => {
    const text = json(
      leaderboardCard({
        ownerId: '1',
        category: 'dice',
        board: board([['9', 137]], 0, 1),
        caller: undefined,
      }),
    );
    expect(text).toContain('## Leaderboard · Dice net');
    expect(text).toContain('<@9> · **+137**');
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
