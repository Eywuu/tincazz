import { beforeEach, describe, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import {
  clearChannelEverywhere,
  logChannelId,
  setLogChannel,
} from '../src/features/settings/store.js';

describe('settings store: log channels', () => {
  let db: Db;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('reads back a channel that was set', () => {
    expect(logChannelId(db, '1', 'economy')).toBeUndefined();
    setLogChannel(db, '1', 'economy', '50', 1);
    expect(logChannelId(db, '1', 'economy')).toBe('50');
  });

  it('returns the previous channel ID', () => {
    expect(setLogChannel(db, '1', 'mod', '50', 1)).toBeUndefined();
    expect(setLogChannel(db, '1', 'mod', '51', 2)).toBe('50');
    expect(logChannelId(db, '1', 'mod')).toBe('51');
  });

  it('clears a channel when set to null', () => {
    setLogChannel(db, '1', 'mod', '50', 1);
    expect(setLogChannel(db, '1', 'mod', null, 2)).toBe('50');
    expect(logChannelId(db, '1', 'mod')).toBeUndefined();
  });

  it('keeps kinds independent', () => {
    setLogChannel(db, '1', 'economy', '50', 1);
    setLogChannel(db, '1', 'mod', '51', 1);
    setLogChannel(db, '1', 'economy', null, 2);
    expect(logChannelId(db, '1', 'mod')).toBe('51');
  });

  it('clears a channel everywhere and reports each place', () => {
    setLogChannel(db, '1', 'economy', '50', 1);
    setLogChannel(db, '1', 'mod', '50', 1);
    setLogChannel(db, '2', 'mod', '50', 1);
    setLogChannel(db, '2', 'economy', '60', 1);
    const cleared = clearChannelEverywhere(db, '50', 5);
    expect(cleared).toHaveLength(3);
    expect(cleared).toEqual(
      expect.arrayContaining([
        { guildId: '1', kind: 'economy' },
        { guildId: '1', kind: 'mod' },
        { guildId: '2', kind: 'mod' },
      ]),
    );
    expect(logChannelId(db, '2', 'economy')).toBe('60');
    expect(logChannelId(db, '1', 'mod')).toBeUndefined();
    expect(clearChannelEverywhere(db, '50', 6)).toEqual([]);
  });
});
