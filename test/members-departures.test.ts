import { beforeEach, expect, it } from 'vitest';
import { type Db, openDatabase } from '../src/db/index.js';
import { wallets } from '../src/db/schema.js';
import { markDeparted, markPresent } from '../src/features/members/departures.js';

let db: Db;

beforeEach(() => {
  db = openDatabase(':memory:');
  db.insert(wallets).values({ guildId: '2', userId: '1', balance: 5, createdAt: 0 }).run();
});

it('keeps the first departedAt when marked twice', () => {
  expect(markDeparted(db, '2', '1', 100)?.departedAt).toBe(100);
  expect(markDeparted(db, '2', '1', 200)).toBeUndefined();
  expect(markPresent(db, '2', '1')?.departedAt).toBeNull();
});

it('returns undefined when there is nothing to change', () => {
  expect(markPresent(db, '2', '1')).toBeUndefined();
  expect(markDeparted(db, '2', '9', 1)).toBeUndefined();
});
