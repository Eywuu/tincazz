import { describe, expect, it } from 'vitest';
import { decodeSpinId, encodeSpinId } from '../src/features/gamba/index.js';

describe('spin button ids', () => {
  it.each([
    { action: 'again', userId: '1', bet: 10 },
    { action: 'again', userId: '123456789012345678', bet: 100 },
    { action: 'double', userId: '1', bet: 10_000 },
  ] as const)('round trips %o', (id) => {
    expect(decodeSpinId(encodeSpinId(id))).toEqual(id);
  });

  it('encodes as gamba:<action>:<userId>:<bet>', () => {
    expect(encodeSpinId({ action: 'double', userId: '7', bet: 200 })).toBe('gamba:double:7:200');
  });

  it('decodes the smallest bet', () => {
    expect(decodeSpinId('gamba:again:1:1')).toEqual({ action: 'again', userId: '1', bet: 1 });
  });

  it('no longer decodes a free-spin id', () => {
    expect(decodeSpinId('gamba:again:1:0')).toBeUndefined();
  });

  it.each([
    'gamba:again:1:999999',
    'gamba:again:abc:10',
    'gamba:double:1:0',
    'gamba:again:1:-1',
    'gamba:again:1:10:x',
    'gamba:spin:1:10',
    'lb:page:1:coins:0',
    '',
  ])('rejects %j', (customId) => {
    expect(decodeSpinId(customId)).toBeUndefined();
  });
});
