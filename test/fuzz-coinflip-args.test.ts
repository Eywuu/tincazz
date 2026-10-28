import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { parseFlipArgs } from '../src/features/coinflip/index.js';

const snowflake = fc.stringMatching(/^[1-9][0-9]{16,19}$/);
const target = fc.oneof(
  snowflake.map((id) => `<@${id}>`),
  snowflake.map((id) => `<@!${id}>`),
  snowflake,
  fc.constant('open'),
  fc.constant('bot'),
);
const bet = fc.constantFrom('10', '1k', '2.5m', 'all', 'half', '50%');
const side = fc.constantFrom('h', 'heads', 'T', 'Tails');

/** A valid token set (target, bet and side) in a fixed order. */
const validTokens = fc.tuple(target, bet, side).map((tokens) => [...tokens]);

describe('fuzz: parseFlipArgs', () => {
  it('never throws on arbitrary tokens', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (tokens) => {
        expect(() => parseFlipArgs(tokens)).not.toThrow();
      }),
    );
  });

  it('never returns a challenge for an @ or role mention token', () => {
    const atToken = fc.oneof(
      fc.string().map((s) => `@${s}`),
      snowflake.map((id) => `<@&${id}>`),
      fc.string().map((s) => `<@&${s}`),
    );
    fc.assert(
      fc.property(fc.array(fc.string()), atToken, fc.nat(5), (tokens, token, at) => {
        const mixed = [...tokens.slice(0, at), token, ...tokens.slice(at)];
        expect(parseFlipArgs(mixed)).toBeUndefined();
      }),
    );
  });

  it('parses a valid token set the same in every order', () => {
    fc.assert(
      fc.property(
        validTokens.chain((tokens) =>
          fc.record({
            tokens: fc.constant(tokens),
            shuffled: fc.shuffledSubarray(tokens, { minLength: tokens.length }),
          }),
        ),
        ({ tokens, shuffled }) => {
          const parsed = parseFlipArgs(tokens);
          expect(parsed).toBeDefined();
          expect(parseFlipArgs(shuffled)).toEqual(parsed);
        },
      ),
    );
  });

  it('is order-independent for arbitrary tokens too', () => {
    fc.assert(
      fc.property(
        fc.array(fc.oneof(fc.string(), target, bet, side), { maxLength: 5 }).chain((tokens) =>
          fc.record({
            tokens: fc.constant(tokens),
            shuffled: fc.shuffledSubarray(tokens, { minLength: tokens.length }),
          }),
        ),
        ({ tokens, shuffled }) => {
          expect(parseFlipArgs(shuffled)).toEqual(parseFlipArgs(tokens));
        },
      ),
    );
  });

  it('keeps the parsed mode, side and bet from the tokens', () => {
    fc.assert(
      fc.property(validTokens, ([t, b, s]) => {
        const parsed = parseFlipArgs([t as string, b as string, s as string]);
        expect(parsed?.bet).toBe(b);
        expect(parsed?.side).toBe((s as string).toLowerCase().startsWith('t') ? 'tails' : 'heads');
        const mode = t === 'bot' ? 'bot' : t === 'open' ? 'open' : 'challenge';
        expect(parsed?.mode).toBe(mode);
        expect(parsed?.opponentId === undefined).toBe(mode !== 'challenge');
      }),
    );
  });
});
