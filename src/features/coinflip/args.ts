import type { FlipMode, FlipSide } from '../../db/schema.js';

export interface FlipArgs {
  mode: FlipMode;
  opponentId?: string;
  side: FlipSide;
  bet?: string;
}

export const flipUsage =
  'Usage: `?cf [bet] [heads|tails]`, `?cf @member [bet] [side]`, `?cf open [bet] [side]`';

const mention = /^<@!?(\d{17,20})>$/;
const bareId = /^\d{17,20}$/;

/**
 * Parses the tokens after `?coinflip`, in any order: an optional target (`bot`, `open`, a user
 * mention or a bare user ID), an optional side and an optional bet. Returns `undefined` for
 * anything ambiguous or malformed so the command can reply with {@link flipUsage}.
 *
 * Role and `@everyone` style tokens are never a target: anything starting with `@` or `<@&` is
 * rejected outright, so they can never become a challenge.
 */
export function parseFlipArgs(tokens: readonly string[]): FlipArgs | undefined {
  let mode: FlipMode | undefined;
  let opponentId: string | undefined;
  let side: FlipSide | undefined;
  let bet: string | undefined;

  for (const token of tokens) {
    if (token === '') continue;
    if (token.startsWith('@') || token.startsWith('<@&')) return undefined;

    const keyword = token.toLowerCase();
    const id = mention.exec(token)?.[1] ?? (bareId.test(token) ? token : undefined);

    if (keyword === 'bot' || keyword === 'open' || id !== undefined) {
      if (mode !== undefined) return undefined;
      mode = id !== undefined ? 'challenge' : keyword === 'bot' ? 'bot' : 'open';
      opponentId = id;
    } else if (keyword === 'h' || keyword === 'heads' || keyword === 't' || keyword === 'tails') {
      if (side !== undefined) return undefined;
      side = keyword.startsWith('t') ? 'tails' : 'heads';
    } else {
      if (bet !== undefined) return undefined;
      bet = token;
    }
  }

  const args: FlipArgs = { mode: mode ?? 'bot', side: side ?? 'heads' };
  if (opponentId !== undefined) args.opponentId = opponentId;
  if (bet !== undefined) args.bet = bet;
  return args;
}
