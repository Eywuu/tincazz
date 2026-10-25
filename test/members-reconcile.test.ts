import fc from 'fast-check';
import { expect, it } from 'vitest';
import { members } from '../src/features/members/config.js';
import { planReconcile, type ReconcileWallet } from '../src/features/members/reconcile.js';

const now = 10 * members.graceMs;

it('departs present wallets that are missing', () => {
  const plan = planReconcile([{ userId: '1', departedAt: null }], new Set(), now);
  expect(plan).toEqual({ depart: ['1'], restore: [], purge: [] });
});

it('restores departed wallets that are present', () => {
  const plan = planReconcile([{ userId: '1', departedAt: 5 }], new Set(['1']), now);
  expect(plan).toEqual({ depart: [], restore: ['1'], purge: [] });
});

it('purges at exactly the grace period but not one ms before', () => {
  const at = planReconcile([{ userId: '1', departedAt: now - members.graceMs }], new Set(), now);
  expect(at.purge).toEqual(['1']);
  const before = planReconcile(
    [{ userId: '1', departedAt: now - members.graceMs + 1 }],
    new Set(),
    now,
  );
  expect(before).toEqual({ depart: [], restore: [], purge: [] });
});

it('only departs (never purges) a present wallet that just went missing', () => {
  const plan = planReconcile([{ userId: '1', departedAt: null }], new Set(), now);
  expect(plan.purge).toEqual([]);
});

it('keeps the plan lists consistent for arbitrary input', () => {
  const walletArb = fc.uniqueArray(
    fc.record({
      userId: fc.stringMatching(/^[1-9][0-9]{0,3}$/),
      departedAt: fc.option(fc.integer({ min: 0, max: now * 2 }), { nil: null }),
    }),
    { selector: (w) => w.userId },
  );
  fc.assert(
    fc.property(
      walletArb,
      fc.uniqueArray(fc.stringMatching(/^[1-9][0-9]{0,3}$/)),
      (list: ReconcileWallet[], ids) => {
        const memberIds = new Set(ids);
        const plan = planReconcile(list, memberIds, now);
        for (const id of [...plan.depart, ...plan.purge]) expect(memberIds.has(id)).toBe(false);
        for (const id of plan.restore) expect(memberIds.has(id)).toBe(true);
        for (const id of plan.purge) {
          const w = list.find((x) => x.userId === id);
          expect(w?.departedAt).not.toBeNull();
          expect(w?.departedAt as number).toBeLessThanOrEqual(now - members.graceMs);
        }
        const all = [...plan.depart, ...plan.restore, ...plan.purge];
        expect(new Set(all).size).toBe(all.length);
      },
    ),
  );
});
