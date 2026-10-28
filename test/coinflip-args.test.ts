import { describe, expect, it } from 'vitest';
import { flipUsage, parseFlipArgs } from '../src/features/coinflip/index.js';

const id = '123456789012345678';

describe('parseFlipArgs', () => {
  it('defaults to a heads flip against the bot with no bet', () => {
    expect(parseFlipArgs([])).toEqual({ mode: 'bot', side: 'heads' });
  });

  it('reads the bet and side in either order', () => {
    const tails = { mode: 'bot', side: 'tails', bet: '500' };
    expect(parseFlipArgs(['500', 'tails'])).toEqual(tails);
    expect(parseFlipArgs(['tails', '500'])).toEqual(tails);
  });

  it('accepts short sides and keeps bet keywords like all', () => {
    expect(parseFlipArgs(['t', 'all'])).toEqual({ mode: 'bot', side: 'tails', bet: 'all' });
    expect(parseFlipArgs(['h'])).toEqual({ mode: 'bot', side: 'heads' });
    expect(parseFlipArgs(['HEADS', '5'])).toEqual({ mode: 'bot', side: 'heads', bet: '5' });
  });

  it('reads a mention, a nickname mention or a bare ID as a challenge', () => {
    const expected = { mode: 'challenge', opponentId: id, side: 'heads', bet: '1k' };
    expect(parseFlipArgs([`<@${id}>`, '1k'])).toEqual(expected);
    expect(parseFlipArgs([`<@!${id}>`, '1k'])).toEqual(expected);
    expect(parseFlipArgs([id, '1k'])).toEqual(expected);
  });

  it('reads open challenges, case-insensitively', () => {
    expect(parseFlipArgs(['open', '250', 'T'])).toEqual({
      mode: 'open',
      side: 'tails',
      bet: '250',
    });
    expect(parseFlipArgs(['OPEN'])).toEqual({ mode: 'open', side: 'heads' });
  });

  it('accepts an explicit bot keyword', () => {
    expect(parseFlipArgs(['bot', '10'])).toEqual({ mode: 'bot', side: 'heads', bet: '10' });
  });

  it('rejects ambiguous or malformed input', () => {
    expect(parseFlipArgs(['10', '20'])).toBeUndefined();
    expect(parseFlipArgs([`<@${id}>`, `<@${id}>`])).toBeUndefined();
    expect(parseFlipArgs([`<@${id}>`, '12345678901234567'])).toBeUndefined();
    expect(parseFlipArgs([`<@${id}>`, 'open'])).toBeUndefined();
    expect(parseFlipArgs(['open', 'bot'])).toBeUndefined();
    expect(parseFlipArgs([`<@${id}>`, 'bot'])).toBeUndefined();
    expect(parseFlipArgs(['heads', 'tails'])).toBeUndefined();
    expect(parseFlipArgs(['heads', 'h'])).toBeUndefined();
  });

  it('never turns @everyone, @here, roles or other @ text into a challenge', () => {
    expect(parseFlipArgs(['@everyone'])).toBeUndefined();
    expect(parseFlipArgs(['@here', '10'])).toBeUndefined();
    expect(parseFlipArgs([`<@&${id}>`])).toBeUndefined();
    expect(parseFlipArgs([`<@&${id}>`, '10'])).toBeUndefined();
    expect(parseFlipArgs(['@someone', '10', 'open'])).toBeUndefined();
  });

  it('has a usage line that names the three forms', () => {
    expect(flipUsage).toBe(
      'Usage: `?cf [bet] [heads|tails]`, `?cf @member [bet] [side]`, `?cf open [bet] [side]`',
    );
  });
});
