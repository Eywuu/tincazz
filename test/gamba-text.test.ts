import { describe, expect, it } from 'vitest';
import { evaluate } from '../src/features/gamba/evaluate.js';
import {
  formatGambaFollowUp,
  formatGambaReply,
  gambaJackpotRoleId,
  type Reels,
  type Spin,
} from '../src/features/gamba/index.js';

const wager = (reels: Reels, payout: number, potWon = 0): Spin => ({
  mode: 'wager',
  reels,
  evaluation: evaluate(reels),
  bet: 100,
  payout,
  potWon,
  balance: 900 + payout + potWon,
  pot: 10_000,
  spinId: 1,
});

describe('formatGambaReply', () => {
  it('adds the stake and balance for a wager', () => {
    expect(formatGambaReply(wager(['head', 'cry', 'python'], 0))).toContain(
      '\nbet 100 → 0 · balance 900',
    );
  });
});

describe('formatGambaFollowUp', () => {
  it('is empty unless all three reels match', () => {
    expect(formatGambaFollowUp('<@1>', wager(['head', 'head', 'cry'], 0))).toBeUndefined();
  });

  it('announces a triple with odds and no gif', () => {
    const text = formatGambaFollowUp('<@1>', wager(['head', 'head', 'head'], 1_500));
    expect(text).toContain('<@1> won! +1,500 coins');
    expect(text).toContain('`Odds: 1 in');
    expect(text).not.toContain('klipy');
  });

  it('adds the gif for python and the pot win and role for a jackpot', () => {
    expect(formatGambaFollowUp('<@1>', wager(['python', 'python', 'python'], 10_000))).toContain(
      'klipy.com',
    );
    const text = formatGambaFollowUp('<@1>', wager(['cpp', 'cpp', 'cpp'], 30_000, 10_000), false);
    expect(text).toContain('+10,000 from the pot');
    expect(text).toContain(`You are a pro! You just won <@&${gambaJackpotRoleId}>`);
    expect(text).toContain("couldn't assign the role");
  });
});
