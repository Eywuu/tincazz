import { isLeaderboardCategory, type LeaderboardCategory } from './config.js';

export type LeaderboardId =
  | { kind: 'page'; ownerId: string; category: LeaderboardCategory; page: number }
  | { kind: 'cat'; ownerId: string };

const prefix = 'lb';

export function encodePageId(ownerId: string, category: LeaderboardCategory, page: number): string {
  return `${prefix}:page:${ownerId}:${category}:${page}`;
}

export function encodeCategoryId(ownerId: string): string {
  return `${prefix}:cat:${ownerId}`;
}

export function decodeLeaderboardId(customId: string): LeaderboardId | undefined {
  const parts = customId.split(':');
  if (parts[0] !== prefix) {
    return undefined;
  }
  if (parts[1] === 'cat' && parts.length === 3) {
    const ownerId = parts[2] as string;
    return /^\d{1,20}$/.test(ownerId) ? { kind: 'cat', ownerId } : undefined;
  }
  if (parts[1] === 'page' && parts.length === 5) {
    const [, , ownerId, category, rawPage] = parts as [string, string, string, string, string];
    if (
      !/^\d{1,20}$/.test(ownerId) ||
      !/^\d{1,6}$/.test(rawPage) ||
      !isLeaderboardCategory(category)
    ) {
      return undefined;
    }
    return { kind: 'page', ownerId, category, page: Number(rawPage) };
  }
  return undefined;
}
