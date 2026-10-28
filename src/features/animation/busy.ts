import { container } from '@sapphire/framework';

declare module '@sapphire/pieces' {
  interface Container {
    /** Users with an animation in flight. Lost on restart. */
    animationBusy?: Set<string>;
  }
}

// Held on the container so every loaded copy of this module (pieces included) shares one state.
const busy = (): Set<string> => {
  container.animationBusy ??= new Set();
  return container.animationBusy;
};

/** Claims the user's animation slot: true only for the first caller until `end`. */
export function tryBegin(userId: string): boolean {
  const users = busy();
  if (users.has(userId)) {
    return false;
  }
  users.add(userId);
  return true;
}

export function end(userId: string): void {
  busy().delete(userId);
}

export function clearBusy(): void {
  busy().clear();
}

/** Ephemeral text for a user who starts a game while their last one is still animating. */
export const stillRolling = 'Your last game is still rolling. Give it a second.';
