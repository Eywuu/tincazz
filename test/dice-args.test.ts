import { describe, expect, it } from 'vitest';
import { diceUsage, parseDiceArgs } from '../src/features/dice/index.js';

const high = { kind: 'high' } as const;
const seven = { kind: 'seven' } as const;

describe('parseDiceArgs', () => {
  it('defaults to a high call with no bet', () => {
    expect(parseDiceArgs([])).toEqual({ call: high });
  });

  it('reads the bet and call in either order', () => {
    expect(parseDiceArgs(['100', 'high'])).toEqual({ call: high, bet: '100' });
    expect(parseDiceArgs(['high', '100'])).toEqual({ call: high, bet: '100' });
  });

  it('accepts short and mixed-case keywords and keeps bet text untouched', () => {
    expect(parseDiceArgs(['lo', '2.5k'])).toEqual({ call: { kind: 'low' }, bet: '2.5k' });
    expect(parseDiceArgs(['L'])).toEqual({ call: { kind: 'low' } });
    expect(parseDiceArgs(['HI', 'ALL'])).toEqual({ call: high, bet: 'ALL' });
    expect(parseDiceArgs(['h'])).toEqual({ call: high });
    expect(parseDiceArgs(['SEVEN', '50%'])).toEqual({ call: seven, bet: '50%' });
  });

  it('reads doubles', () => {
    expect(parseDiceArgs(['dbl'])).toEqual({ call: { kind: 'doubles' } });
    expect(parseDiceArgs(['d'])).toEqual({ call: { kind: 'doubles' } });
    expect(parseDiceArgs(['Doubles', '10'])).toEqual({ call: { kind: 'doubles' }, bet: '10' });
  });

  it('reads a lone 7 as the seven call', () => {
    expect(parseDiceArgs(['7'])).toEqual({ call: seven });
  });

  it('reads =n and exact n as an exact call', () => {
    const exact12 = { call: { kind: 'exact', target: 12 }, bet: 'all' };
    expect(parseDiceArgs(['=12', 'all'])).toEqual(exact12);
    expect(parseDiceArgs(['all', '=12'])).toEqual(exact12);
    expect(parseDiceArgs(['exact', '12', 'all'])).toEqual(exact12);
    expect(parseDiceArgs(['all', 'EXACT', '12'])).toEqual(exact12);
    expect(parseDiceArgs(['=2'])).toEqual({ call: { kind: 'exact', target: 2 } });
  });

  it('maps =7 and exact 7 to seven', () => {
    expect(parseDiceArgs(['=7'])).toEqual({ call: seven });
    expect(parseDiceArgs(['exact', '7'])).toEqual({ call: seven });
  });

  it('reads a bare number as a bet, never an exact call', () => {
    expect(parseDiceArgs(['12'])).toEqual({ call: high, bet: '12' });
    expect(parseDiceArgs(['=12', '12'])).toEqual({
      call: { kind: 'exact', target: 12 },
      bet: '12',
    });
    expect(parseDiceArgs(['12', '=12'])).toEqual({
      call: { kind: 'exact', target: 12 },
      bet: '12',
    });
  });

  it('treats 7 as a bet once another call has been given, in any order', () => {
    expect(parseDiceArgs(['high', '7'])).toEqual({ call: high, bet: '7' });
    expect(parseDiceArgs(['7', 'high'])).toEqual({ call: high, bet: '7' });
    expect(parseDiceArgs(['=5', '7'])).toEqual({ call: { kind: 'exact', target: 5 }, bet: '7' });
    expect(parseDiceArgs(['7', '7'])).toEqual({ call: seven, bet: '7' });
  });

  it('skips empty tokens', () => {
    expect(parseDiceArgs(['', 'low', '', '5'])).toEqual({ call: { kind: 'low' }, bet: '5' });
  });

  it('rejects exact targets outside 2-12', () => {
    for (const tokens of [['=13'], ['=1'], ['=0'], ['=07'], ['=x'], ['='], ['exact', '13']]) {
      expect(parseDiceArgs(tokens)).toBeUndefined();
    }
  });

  it('rejects two calls, two bets and a dangling exact', () => {
    for (const tokens of [
      ['high', 'low'],
      ['=5', 'high'],
      ['d', '=5'],
      ['10', '20'],
      ['7', '7', '7'],
      ['exact'],
      ['exact', 'x'],
      ['exact', 'high'],
      ['10', 'exact'],
    ]) {
      expect(parseDiceArgs(tokens)).toBeUndefined();
    }
  });

  it('has a usage string naming the calls', () => {
    expect(diceUsage).toBe('Usage: `?dice [bet] [high|low|seven|doubles|=2…12]`');
  });
});
