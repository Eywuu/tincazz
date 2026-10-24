import { describe, expect, it } from 'vitest';
import { freePrizes } from '../src/features/gamba/config.js';
import { evaluate } from '../src/features/gamba/evaluate.js';
import { spinGamba } from '../src/features/gamba/index.js';

describe('evaluate', () => {
  it('classifies all 21^3 draws', () => {
    const counts = { none: 0, pair: 0, triple: 0, jackpot: 0 };
    let prizes = 0;
    for (let a = 0; a < 21; a++) {
      for (let b = 0; b < 21; b++) {
        for (let c = 0; c < 21; c++) {
          const draws = [a, b, c];
          const evaluation = evaluate(spinGamba(() => draws.shift() ?? 0));
          counts[evaluation.result]++;
          prizes += evaluation.freePrize;
        }
      }
    }
    expect(counts).toEqual({ none: 5886, pair: 3204, triple: 170, jackpot: 1 });
    expect(prizes).toBe(14_600);
  });

  it('pays the jackpot for three cpp', () => {
    expect(evaluate(['cpp', 'cpp', 'cpp'])).toEqual({
      result: 'jackpot',
      freePrize: freePrizes.cpp,
      odds: 9261,
    });
  });

  it('pays python and yt triples', () => {
    expect(evaluate(['python', 'python', 'python'])).toEqual({
      result: 'triple',
      freePrize: 500,
      odds: 1158,
    });
    expect(evaluate(['head', 'head', 'head'])).toEqual({
      result: 'triple',
      freePrize: 50,
      odds: 343,
    });
  });

  it('does not pay a pair', () => {
    expect(evaluate(['head', 'head', 'cpp'])).toEqual({
      result: 'pair',
      freePrize: 0,
      odds: undefined,
    });
  });
});
