import { container } from '@sapphire/framework';

declare module '@sapphire/pieces' {
  interface Container {
    /** The one gamba card per user whose buttons still work, by message ID. Lost on restart. */
    gambaCards?: Map<string, string>;
  }
}

// Held on the container so every loaded copy of this module (pieces included) shares one map.
const cards = () => {
  container.gambaCards ??= new Map();
  return container.gambaCards;
};

export function setActiveCard(userId: string, messageId: string): void {
  cards().set(userId, messageId);
}

/**
 * Whether `messageId` is the user's live card. A user with no tracked card (for example after a
 * restart) adopts the clicked one, so cards sent before a deploy keep working until a newer one
 * supersedes them.
 */
export function isActiveCard(userId: string, messageId: string): boolean {
  const current = cards().get(userId);
  if (current === undefined) {
    cards().set(userId, messageId);
    return true;
  }
  return current === messageId;
}

export function clearActiveCards(): void {
  cards().clear();
}
