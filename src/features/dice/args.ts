import type { DiceCall } from './calls.js';
import { defaultCall } from './calls.js';

export interface DiceArgs {
  bet?: string;
  call: DiceCall;
}

export const diceUsage = 'Usage: `?dice [bet] [high|low|seven|doubles|=2…12]`';

const keywords: Readonly<Record<string, DiceCall>> = {
  high: { kind: 'high' },
  hi: { kind: 'high' },
  h: { kind: 'high' },
  low: { kind: 'low' },
  lo: { kind: 'low' },
  l: { kind: 'low' },
  seven: { kind: 'seven' },
  doubles: { kind: 'doubles' },
  dbl: { kind: 'doubles' },
  d: { kind: 'doubles' },
};

/** An exact total, 2-12 with no leading zeros; 7 is the `seven` call. */
function exactCall(text: string): DiceCall | undefined {
  if (!/^(?:[2-9]|1[0-2])$/.test(text)) return undefined;
  const target = Number(text);
  return target === 7 ? { kind: 'seven' } : { kind: 'exact', target };
}

/**
 * Parses the tokens after `?dice`, in any order: an optional call (`high|hi|h`, `low|lo|l`,
 * `seven`, `doubles|dbl|d`, `=<n>` or `exact <n>`) and an optional bet. Returns `undefined` for
 * anything ambiguous or malformed so the command can reply with {@link diceUsage}.
 *
 * A bare number is always a bet, never an exact call (`12` bets 12 coins on high). The one
 * exception is a lone `7`: with no other call given it means `seven`. That is decided after the
 * whole list is read, so `7 high` and `high 7` both mean high with a bet of 7.
 */
export function parseDiceArgs(tokens: readonly string[]): DiceArgs | undefined {
  let call: DiceCall | undefined;
  let bet: string | undefined;
  let bareSevens = 0;

  const takeCall = (next: DiceCall | undefined): boolean => {
    if (next === undefined || call !== undefined) return false;
    call = next;
    return true;
  };
  const takeBet = (text: string): boolean => {
    if (bet !== undefined) return false;
    bet = text;
    return true;
  };

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i] ?? '';
    if (token === '') continue;
    const keyword = token.toLowerCase();

    if (keyword === 'exact') {
      i++;
      if (!takeCall(exactCall(tokens[i] ?? ''))) return undefined;
    } else if (keyword.startsWith('=')) {
      if (!takeCall(exactCall(keyword.slice(1)))) return undefined;
    } else if (Object.hasOwn(keywords, keyword)) {
      if (!takeCall(keywords[keyword])) return undefined;
    } else if (token === '7') {
      bareSevens++;
    } else if (!takeBet(token)) {
      return undefined;
    }
  }

  if (bareSevens > 0) {
    if (call === undefined) {
      call = { kind: 'seven' };
      bareSevens--;
    }
    if (bareSevens > 0 && !takeBet('7')) return undefined;
    if (bareSevens > 1) return undefined;
  }

  return bet === undefined ? { call: call ?? defaultCall } : { call: call ?? defaultCall, bet };
}
