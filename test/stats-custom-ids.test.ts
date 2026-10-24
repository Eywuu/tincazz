import { describe, expect, it } from 'vitest';
import {
  decodeLeaderboardId,
  encodeCategoryId,
  encodePageId,
} from '../src/features/stats/index.js';

describe('leaderboard custom ids', () => {
  it('round trips a page id', () => {
    const id = encodePageId('123', 'biggest-win', 4);
    expect(id).toBe('lb:page:123:biggest-win:4');
    expect(decodeLeaderboardId(id)).toEqual({
      kind: 'page',
      ownerId: '123',
      category: 'biggest-win',
      page: 4,
    });
  });

  it('round trips a category id', () => {
    const id = encodeCategoryId('123');
    expect(id).toBe('lb:cat:123');
    expect(decodeLeaderboardId(id)).toEqual({ kind: 'cat', ownerId: '123' });
  });

  it.each([
    'lb:page:1:gold:0',
    'lb:page:1:coins:-1',
    'lb:page:1:coins:1.5',
    'lb:page:1:coins:1234567',
    'lb:page:abc:coins:0',
    'lb:page:1:coins',
    'lb:cat:1:x',
    'lb:cat:',
    'gamba:again:1:0',
    '',
  ])('ignores %j', (customId) => {
    expect(decodeLeaderboardId(customId)).toBeUndefined();
  });
});
