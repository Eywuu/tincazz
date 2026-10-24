import { describe, expect, it } from 'vitest';
import {
  type BotFlip,
  botFlipCard,
  ChallengeTakenError,
  type ChallengeView,
  challengeCard,
  challengeClosedCard,
  challengeResultCard,
  challengeTaken,
  flipErrorText,
  type SettledChallenge,
  ShortStakeError,
} from '../src/features/coinflip/index.js';
import { InsufficientFundsError } from '../src/features/economy/errors.js';
import { InvalidBetError, spinErrorText } from '../src/features/gamba/index.js';
import { accents } from '../src/features/ui/index.js';

const json = (c: { toJSON(): unknown }) => JSON.stringify(c.toJSON());
const accent = (c: { toJSON(): { accent_color?: number | null } }) => c.toJSON().accent_color;
const buttonIds = (c: { toJSON(): unknown }) =>
  [...json(c).matchAll(/"custom_id":"([^"]+)"/g)].map((match) => match[1]);

const flip = (extra: Partial<BotFlip> = {}): BotFlip => ({
  bet: 100,
  side: 'heads',
  result: 'heads',
  won: true,
  rake: 6,
  credited: 194,
  balance: 1_094,
  pot: 10_006,
  flipId: 1,
  ...extra,
});

const view = (extra: Partial<ChallengeView> = {}): ChallengeView => ({
  challengerId: '1',
  opponentId: '2',
  bet: 100,
  side: 'heads',
  expiresAt: 1_800_000_000_000,
  ...extra,
});

const settled: SettledChallenge = {
  result: 'tails',
  winnerId: '2',
  loserId: '1',
  rake: 6,
  credited: 194,
  challengerBalance: 900,
  acceptorBalance: 1_094,
  pot: 10_006,
  flipId: 1,
};

describe('botFlipCard', () => {
  it('shows a win with the flip again button', () => {
    const c = botFlipCard('1', flip());
    expect(accent(c)).toBe(accents.win);
    expect(json(c)).toContain('Heads');
    expect(json(c)).toContain('+94');
    expect(json(c)).toContain('balance 1,094 · pot 10,006');
    expect(buttonIds(c)).toEqual(['cf:again:1:100:heads']);
  });

  it('shows a loss', () => {
    const c = botFlipCard('1', flip({ result: 'tails', won: false, credited: 0, balance: 900 }));
    expect(accent(c)).toBe(accents.loss);
    expect(json(c)).toContain('Tails');
    expect(json(c)).toContain('-100');
  });
});

describe('challengeCard', () => {
  it('has accept, decline and cancel for a targeted challenge', () => {
    const c = challengeCard(view());
    const ids = buttonIds(c) as string[];
    expect(ids.map((id) => id.split(':').slice(0, 4).join(':'))).toEqual([
      'cf:accept:1:2',
      'cf:decline:1:2',
      'cf:cancel:1:2',
    ]);
    expect(accent(c)).toBe(accents.brand);
    expect(json(c)).toContain('<@2>');
    expect(json(c)).toContain('<t:1800000000:R>');
  });

  it('has accept and cancel for an open challenge', () => {
    const c = challengeCard(view({ opponentId: undefined }));
    const ids = buttonIds(c) as string[];
    expect(ids).toHaveLength(2);
    expect(ids[0]).toMatch(/^cf:accept:1:0:/);
    expect(json(c)).toContain('Anyone');
  });
});

describe('result and closed cards', () => {
  it('shows the winner and the rake with no buttons', () => {
    const c = challengeResultCard(view(), settled);
    expect(accent(c)).toBe(accents.gold);
    expect(json(c)).toContain('<@2> wins **194**');
    expect(json(c)).toContain('rake 6 to the pot · pot 10,006');
    expect(buttonIds(c)).toEqual([]);
  });

  it.each([
    ['expired', 'Challenge expired.'],
    ['declined', '<@2> declined.'],
    ['cancelled', '<@1> cancelled.'],
    ['challenger-short', "<@1> can't cover the bet anymore."],
  ] as const)('closes as %s', (reason, text) => {
    const c = challengeClosedCard(view(), reason);
    expect(json(c)).toContain(text);
    expect(buttonIds(c)).toEqual([]);
    expect(accent(c)).toBe(accents.loss);
  });
});

describe('flipErrorText', () => {
  it('explains a short acceptor', () => {
    expect(flipErrorText(new ShortStakeError('acceptor', '3', 5, 100))).toBe(
      'You need 100 coins to accept. You have 5.',
    );
  });

  it('explains a taken challenge', () => {
    expect(flipErrorText(new ChallengeTakenError())).toBe(challengeTaken);
  });

  it('falls back to the gamba texts', () => {
    const invalid = new InvalidBetError('range', '5');
    expect(flipErrorText(invalid)).toBe(spinErrorText(invalid));
    const poor = new InsufficientFundsError(5, 10);
    expect(flipErrorText(poor)).toBe(spinErrorText(poor));
  });

  it('returns undefined for anything else', () => {
    expect(flipErrorText(new Error('boom'))).toBeUndefined();
  });
});
