import type { SpinResult } from '../../db/schema.js';
import { type PayoutTier, payoutBps } from './config.js';
import { type Reels, threeOfAKindOdds } from './index.js';

export interface Evaluation {
  result: SpinResult;
  odds: number | undefined;
  tier: PayoutTier;
  payoutBps: number;
}

function withTier(tier: PayoutTier) {
  return { tier, payoutBps: payoutBps[tier] };
}

export function evaluate(reels: Reels): Evaluation {
  const [first, second, third] = reels;
  const odds = threeOfAKindOdds(reels);

  if (first === second && second === third) {
    if (first === 'cpp') {
      return { result: 'jackpot', odds, ...withTier('cppTriple') };
    }
    const tier = first === 'python' ? 'pythonTriple' : 'ytTriple';
    return { result: 'triple', odds, ...withTier(tier) };
  }
  const repeated =
    first === second || first === third ? first : second === third ? second : undefined;
  if (repeated === undefined) {
    return { result: 'none', odds, ...withTier('none') };
  }
  const tier = repeated === 'python' ? 'pythonPair' : repeated === 'cpp' ? 'cppPair' : 'ytPair';
  return { result: 'pair', odds, ...withTier(tier) };
}
