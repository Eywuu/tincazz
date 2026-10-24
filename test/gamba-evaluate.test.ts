import { describe, expect, it } from 'vitest';
import { freePrizes } from '../src/features/gamba/config.js';
import { evaluate } from '../src/features/gamba/evaluate.js';
import { spinGamba } from '../src/features/gamba/index.js';

describe('evaluate', () => {
  it('classifies all 21^3 draws', () => {
    const counts = { none: 0, pair: 0, triple: 0, jackpot: 0 };
    let prizes = 0;
    let totalBps = 0;
    const tierCounts: Record<string, number> = {};
    for (let a = 0; a < 21; a++) {
      for (let b = 0; b < 21; b++) {
        for (let c = 0; c < 21; c++) {
          const draws = [a, b, c];
          const evaluation = evaluate(spinGamba(() => draws.shift() ?? 0));
          counts[evaluation.result]++;
          prizes += evaluation.freePrize;
          totalBps += evaluation.payoutBps;
          tierCounts[evaluation.tier] = (tierCounts[evaluation.tier] ?? 0) + 1;
        }
      }
    }
    expect(counts).toEqual({ none: 5886, pair: 3204, triple: 170, jackpot: 1 });
    expect(prizes).toBe(14_600);
    expect(tierCounts).toEqual({
      none: 5886,
      ytPair: 2916,
      pythonPair: 228,
      cppPair: 60,
      ytTriple: 162,
      pythonTriple: 8,
      cppTriple: 1,
    });
    expect(totalBps).toBe(85_412_000);
  });

  it('pays the jackpot for three cpp', () => {
    expect(evaluate(['cpp', 'cpp', 'cpp'])).toEqual({
      result: 'jackpot',
      freePrize: freePrizes.cpp,
      odds: 9261,
      tier: 'cppTriple',
      payoutBps: 3_000_000,
    });
  });

  it('pays python and yt triples', () => {
    expect(evaluate(['python', 'python', 'python'])).toEqual({
      result: 'triple',
      freePrize: 500,
      odds: 1158,
      tier: 'pythonTriple',
      payoutBps: 1_000_000,
    });
    expect(evaluate(['head', 'head', 'head'])).toEqual({
      result: 'triple',
      freePrize: 50,
      odds: 343,
      tier: 'ytTriple',
      payoutBps: 150_000,
    });
  });

  it('does not pay a free pair', () => {
    expect(evaluate(['head', 'head', 'cpp'])).toEqual({
      result: 'pair',
      freePrize: 0,
      odds: undefined,
      tier: 'ytPair',
      payoutBps: 12_000,
    });
  });

  it('tiers pairs by the repeated key', () => {
    expect(evaluate(['python', 'head', 'python'])).toMatchObject({
      tier: 'pythonPair',
      payoutBps: 40_000,
    });
    expect(evaluate(['cpp', 'cpp', 'head'])).toMatchObject({ tier: 'cppPair', payoutBps: 100_000 });
    expect(evaluate(['head', 'cry', 'grr'])).toMatchObject({ tier: 'none', payoutBps: 0 });
  });
});
