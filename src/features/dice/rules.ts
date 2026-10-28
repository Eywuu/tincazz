import { randomInt as cryptoRandomInt } from 'node:crypto';
import type { RandomInt } from '../gamba/roll.js';
import { type DiceCall, dieFace } from './calls.js';
import { dice } from './config.js';

/** Rolls two fair dice. */
export function rollDice(randomInt: RandomInt = cryptoRandomInt): [number, number] {
  return [randomInt(6) + 1, randomInt(6) + 1];
}

/** Whether a roll of two dice wins the call. High is 8-12, low is 2-6. */
export function wins(call: DiceCall, die1: number, die2: number): boolean {
  const total = die1 + die2;
  switch (call.kind) {
    case 'high':
      return total >= 8;
    case 'low':
      return total <= 6;
    case 'seven':
      return total === 7;
    case 'doubles':
      return die1 === die2;
    case 'exact':
      return total === call.target;
  }
}

/** How many of the 36 equally likely rolls win the call. */
export function ways(call: DiceCall): number {
  switch (call.kind) {
    case 'high':
    case 'low':
      return 15;
    case 'seven':
    case 'doubles':
      return 6;
    case 'exact':
      return 6 - Math.abs(call.target - 7);
  }
}

/** Payout in basis points of the bet: 36 times the return, split across the winning ways. */
export function payoutBps(call: DiceCall): number {
  return (36 * dice.returnBps) / ways(call);
}

/** Coins paid for a winning wager, floored to whole coins. */
export function payoutFor(call: DiceCall, bet: number): number {
  return Math.floor((bet * payoutBps(call)) / 10_000);
}

/** Coins taken from a wager as the house edge: a percentage, at least one. */
export function diceEdge(bet: number): number {
  return Math.max(1, Math.floor((bet * dice.edgePercent) / 100));
}

/** What the first die leaves the player needing, shown while the second die is still rolling. */
export function needsText(call: DiceCall, die1: number): string {
  const face = dieFace(die1);
  switch (call.kind) {
    case 'high': {
      const needed = 8 - die1;
      if (needed > 6) return `${face} … can't make high now`;
      if (needed <= 2) return `${face} … any 2+ wins`;
      return `${face} … needs ${needed}+`;
    }
    case 'low': {
      const max = 6 - die1;
      if (max < 1) return `${face} … can't make low now`;
      return `${face} … needs ${max} or less`;
    }
    case 'seven':
      return `${face} … needs a ${dieFace(7 - die1)}`;
    case 'doubles':
      return `${face} … needs a ${face} for doubles`;
    case 'exact': {
      const needed = call.target - die1;
      if (needed < 1 || needed > 6) return `${face} … can't make ${call.target} now`;
      return `${face} … needs a ${dieFace(needed)}`;
    }
  }
}
