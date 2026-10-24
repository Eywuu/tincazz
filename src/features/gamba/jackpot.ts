import { container } from '@sapphire/framework';
import { gambaJackpotRoleId } from './outcomes.js';

export interface JackpotMember {
  roles: { add(roleId: string, reason?: string): Promise<unknown> };
}

/** Gives the jackpot role to the winner. Never throws: a failure is logged and returns false. */
export async function assignJackpotRole(
  member: JackpotMember | null | undefined,
  userId: string,
): Promise<boolean> {
  try {
    if (!member) {
      throw new Error('member not cached');
    }
    await member.roles.add(gambaJackpotRoleId, 'gamba jackpot');
    return true;
  } catch (error) {
    container.logger.warn(
      `gamba: could not assign jackpot role to ${userId}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return false;
  }
}
