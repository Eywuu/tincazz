import type { SpinResult } from '../../db/schema.js';
import { freePrizes } from './config.js';
import { type Reels, threeOfAKindOdds } from './index.js';

export interface Evaluation {
  result: SpinResult;
  freePrize: number;
  odds: number | undefined;
}

export function evaluate(reels: Reels): Evaluation {
  const [first, second, third] = reels;
  const odds = threeOfAKindOdds(reels);

  if (first === second && second === third) {
    if (first === 'cpp') {
      return { result: 'jackpot', freePrize: freePrizes.cpp, odds };
    }
    const freePrize = first === 'python' ? freePrizes.python : freePrizes.yt;
    return { result: 'triple', freePrize, odds };
  }
  const pair = first === second || second === third || first === third;
  return { result: pair ? 'pair' : 'none', freePrize: 0, odds };
}
