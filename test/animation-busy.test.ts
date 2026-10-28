import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { clearBusy, end, stillRolling, tryBegin } from '../src/features/animation/index.js';

describe('animation busy lock', () => {
  beforeEach(() => clearBusy());
  afterEach(() => clearBusy());

  it('tryBegin is true once, false while held, true again after end', () => {
    expect(tryBegin('u')).toBe(true);
    expect(tryBegin('u')).toBe(false);
    end('u');
    expect(tryBegin('u')).toBe(true);
  });

  it('different users do not block each other', () => {
    expect(tryBegin('a')).toBe(true);
    expect(tryBegin('b')).toBe(true);
  });

  it('uses the exact still rolling text', () => {
    expect(stillRolling).toBe('Still rolling… wait for your last one to land.');
  });
});
