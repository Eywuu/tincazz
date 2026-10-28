import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { flipSides } from '../src/db/schema.js';
import { wager } from '../src/features/coinflip/config.js';
import {
  type ChallengeId,
  decodeCoinflipId,
  encodeChallengeId,
  encodeFlipAgainId,
  encodeRematchId,
  type FlipAgainId,
  flipRake,
} from '../src/features/coinflip/index.js';

const snowflake = fc.stringMatching(/^[0-9]{1,20}$/);
const bet = fc.integer({ min: wager.minBet, max: wager.maxBet });
const side = fc.constantFrom(...flipSides);

const flipAgain: fc.Arbitrary<Omit<FlipAgainId, 'kind'>> = fc.record({
  userId: snowflake,
  bet,
  side,
});

const challenge: fc.Arbitrary<Omit<ChallengeId, 'kind'>> = fc
  .record({
    action: fc.constantFrom('accept', 'decline', 'cancel' as const),
    challengerId: snowflake,
    opponentId: fc.option(
      snowflake.filter((id) => id !== '0'),
      { nil: undefined },
    ),
    bet,
    side,
    expiresAt: fc.integer({ min: 0, max: 10_000_000_000 }).map((seconds) => seconds * 1000),
  })
  .filter((id) => id.action !== 'decline' || id.opponentId !== undefined);

const rematch = fc
  .record({ challengerId: snowflake, acceptorId: snowflake, bet, challengerSide: side })
  .filter((id) => id.challengerId !== id.acceptorId);

const valid = fc.oneof(
  flipAgain.map(encodeFlipAgainId),
  challenge.map(encodeChallengeId),
  rematch.map(encodeRematchId),
);

const mutated = valid.chain((id) =>
  fc
    .tuple(fc.nat({ max: id.length }), fc.string({ maxLength: 4 }))
    .map(([at, noise]) => id.slice(0, at) + noise + id.slice(at + 1)),
);

describe('coinflip fuzz', () => {
  it('never throws while decoding arbitrary or mutated input', () => {
    fc.assert(
      fc.property(fc.oneof(fc.string({ unit: 'binary', maxLength: 120 }), mutated), (customId) => {
        decodeCoinflipId(customId);
      }),
    );
  });

  it('round-trips every valid flip again id within 100 characters', () => {
    fc.assert(
      fc.property(flipAgain, (id) => {
        const encoded = encodeFlipAgainId(id);
        expect(encoded.length).toBeLessThanOrEqual(100);
        expect(decodeCoinflipId(encoded)).toEqual({ kind: 'again', ...id });
      }),
    );
  });

  it('round-trips every valid challenge id within 100 characters', () => {
    fc.assert(
      fc.property(challenge, (id) => {
        const encoded = encodeChallengeId(id);
        expect(encoded.length).toBeLessThanOrEqual(100);
        expect(decodeCoinflipId(encoded)).toEqual({ kind: 'challenge', ...id });
      }),
    );
  });

  it('keeps the rake between 1 and the bet, and a win above the stake', () => {
    fc.assert(
      fc.property(bet, (value) => {
        const rake = flipRake(value);
        expect(rake).toBeGreaterThanOrEqual(1);
        expect(rake).toBeLessThanOrEqual(value);
        // The winner's credit never drops below the stake, so a win can't lose coins.
        expect(2 * value - rake).toBeGreaterThanOrEqual(value);
      }),
    );
  });
});
