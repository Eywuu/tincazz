import type { ButtonInteraction, Message, RepliableInteraction } from 'discord.js';
import type { CardReply, Display } from './play.js';

/** A command's reply, then edits of it. */
export function replyDisplay(interaction: RepliableInteraction): Display {
  return {
    first: (reply: CardReply) => interaction.reply(reply),
    next: (reply: CardReply) => interaction.editReply(reply),
  };
}

/** A button press that updates the card it sits on, then edits it. */
export function updateDisplay(interaction: ButtonInteraction): Display {
  return {
    first: (reply: CardReply) => interaction.update(reply),
    next: (reply: CardReply) => interaction.editReply(reply),
    fallback: (reply: CardReply) => interaction.message.edit(reply),
  };
}

/** A reply to a prefix-command message, then edits of the reply. */
export function messageDisplay(message: Message): Display & { sent(): Message | undefined } {
  let sent: Message | undefined;
  return {
    first: async (reply: CardReply) => {
      sent = await message.reply(reply);
      return sent;
    },
    next: async (reply: CardReply) => {
      if (!sent) {
        throw new Error('no reply to edit');
      }
      return sent.edit(reply);
    },
    sent: () => sent,
  };
}
