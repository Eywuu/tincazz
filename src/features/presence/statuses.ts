import { ActivityType } from 'discord.js';
import { coins } from '../ui/index.js';

export interface PresenceSnapshot {
  pot: number;
  lastWinnerName?: string;
  lastWonAt?: number;
  spinsToday: number;
}

export interface Status {
  type: ActivityType.Watching | ActivityType.Playing;
  text: string;
}

/** A short relative time such as `5m ago`; anything under a minute is `just now`. */
export function ago(ms: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - ms) / 1000));
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/** The statuses to rotate through, in order. Lines without data (no winner, no spins) are left out. */
export function buildStatuses(snapshot: PresenceSnapshot, now: number): Status[] {
  const statuses: Status[] = [
    { type: ActivityType.Watching, text: `the pot: ${coins(snapshot.pot)} coins` },
    { type: ActivityType.Playing, text: '/gamba to win the pot' },
  ];
  if (snapshot.lastWinnerName && snapshot.lastWonAt !== undefined) {
    statuses.push({
      type: ActivityType.Watching,
      text: `${snapshot.lastWinnerName} hit the jackpot ${ago(snapshot.lastWonAt, now)}`,
    });
  }
  if (snapshot.spinsToday > 0) {
    const noun = snapshot.spinsToday === 1 ? 'spin' : 'spins';
    statuses.push({
      type: ActivityType.Watching,
      text: `${coins(snapshot.spinsToday)} ${noun} today`,
    });
  }
  return statuses;
}
