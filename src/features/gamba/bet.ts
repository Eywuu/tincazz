import { InsufficientFundsError } from '../economy/errors.js';
import { wager } from './config.js';

// No parameter properties: Node's strip-only TypeScript loader (used for pieces in tests) rejects them.
export class InvalidBetError extends Error {
  public readonly kind: 'format' | 'range';
  public readonly input: string;

  public constructor(kind: 'format' | 'range', input: string) {
    super(`Invalid bet (${kind}): ${input}`);
    this.kind = kind;
    this.input = input;
  }
}

/** Parses "100", "2.5k", "all" or "half" into a whole coin amount within the bet limits. */
export function parseBet(input: string, balance: number): number {
  const text = input.trim().toLowerCase();

  let fixed: number | undefined;
  if (/^\d+$/.test(text)) {
    fixed = Number(text);
  } else if (/^\d+(\.\d+)?k$/.test(text)) {
    const [whole = '0', fraction = ''] = text.slice(0, -1).split('.');
    if (fraction.length > 3) {
      throw new InvalidBetError('format', input);
    }
    fixed = Number(whole) * 1000 + Number(fraction.padEnd(3, '0'));
  } else if (text !== 'all' && text !== 'half') {
    throw new InvalidBetError('format', input);
  }

  if (balance < wager.minBet) {
    throw new InsufficientFundsError(balance, wager.minBet);
  }

  let value: number;
  if (fixed !== undefined) {
    value = fixed;
  } else if (text === 'all') {
    value = Math.min(balance, wager.maxBet);
  } else {
    value = Math.floor(balance / 2);
  }

  if (value < wager.minBet || value > wager.maxBet) {
    throw new InvalidBetError('range', input);
  }
  if (value > balance) {
    throw new InsufficientFundsError(balance, value);
  }
  return value;
}
