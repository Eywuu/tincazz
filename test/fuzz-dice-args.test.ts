import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { encodeCall, parseDiceArgs } from '../src/features/dice/index.js';

const bet = fc.constantFrom('10', '1k', '2.5m', 'all', 'half', '50%', '12', '7', '2');
const callUnit = fc.oneof(
  fc
    .constantFrom('h', 'Hi', 'HIGH', 'l', 'lo', 'Low', 'seven', 'SEVEN', 'd', 'dbl', 'Doubles')
    .map((t) => [t]),
  fc.integer({ min: 2, max: 12 }).map((n) => [`=${n}`]),
  fc.integer({ min: 2, max: 12 }).map((n) => ['exact', String(n)]),
);

/** A valid set: at most one call unit and at most one bet, as whole units. */
const validUnits = fc
  .tuple(fc.option(callUnit, { nil: undefined }), fc.option(bet, { nil: undefined }))
  .map(([call, b]) => [...(call ? [call] : []), ...(b ? [[b]] : [])]);

describe('fuzz: parseDiceArgs', () => {
  it('never throws on arbitrary tokens', () => {
    fc.assert(
      fc.property(fc.array(fc.string()), (tokens) => {
        expect(() => parseDiceArgs(tokens)).not.toThrow();
      }),
      { numRuns: 2000 },
    );
  });

  it('never throws on tokens built from the grammar', () => {
    const token = fc.oneof(
      fc.constantFrom('exact', '=', '=7', '=13', '7', '12', 'high', 'low', 'all', '', 'D'),
      fc.string(),
    );
    fc.assert(
      fc.property(fc.array(token, { maxLength: 6 }), (tokens) => {
        expect(() => parseDiceArgs(tokens)).not.toThrow();
      }),
    );
  });

  it('parses a valid set the same in every order of its units', () => {
    fc.assert(
      fc.property(
        validUnits.chain((units) =>
          fc.record({
            units: fc.constant(units),
            shuffled: fc.shuffledSubarray(units, { minLength: units.length }),
          }),
        ),
        ({ units, shuffled }) => {
          const parsed = parseDiceArgs(units.flat());
          expect(parsed).toBeDefined();
          expect(parseDiceArgs(shuffled.flat())).toEqual(parsed);
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('keeps the bet text and an exact target from the tokens', () => {
    fc.assert(
      fc.property(callUnit, bet, (unit, b) => {
        const parsed = parseDiceArgs([...unit, b]);
        expect(parsed?.bet).toBe(b);
        const target =
          unit[0] === 'exact'
            ? Number(unit[1])
            : /^=\d+$/.test(unit[0] ?? '')
              ? Number((unit[0] as string).slice(1))
              : undefined;
        if (target !== undefined) {
          expect(encodeCall(parsed?.call ?? { kind: 'high' })).toBe(
            target === 7 ? '7' : `e${target}`,
          );
        }
      }),
    );
  });

  it('rejects any second call or second bet', () => {
    fc.assert(
      fc.property(callUnit, callUnit, (a, b) => {
        expect(parseDiceArgs([...a, ...b])).toBeUndefined();
      }),
    );
    fc.assert(
      fc.property(bet, bet, (a, b) => {
        // Two bet tokens, unless one of them is the lone seven call.
        if (a === '7' && b === '7') return;
        if (a === '7' || b === '7') return;
        expect(parseDiceArgs([a, b])).toBeUndefined();
      }),
    );
  });

  it('never reads a bare number as an exact call', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 99999 }).filter((n) => n !== 7),
        (n) => {
          expect(parseDiceArgs([String(n)])).toEqual({ call: { kind: 'high' }, bet: String(n) });
        },
      ),
    );
  });
});
