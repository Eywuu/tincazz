import { Command } from '@sapphire/framework';
import type { ChatInputCommandInteraction, Message } from 'discord.js';
import { helpCard } from '../../features/help/index.js';
import { cardReply } from '../../features/ui/index.js';

export class HelpCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, { name: 'help', description: 'Shows the games and how to earn coins' });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    return interaction.reply(cardReply(helpCard(this.prefix()), { ephemeral: true }));
  }

  public override async messageRun(message: Message) {
    return message.reply(cardReply(helpCard(this.prefix())));
  }

  /** The configured command prefix (`COMMAND_PREFIX`), as set on the client. */
  private prefix(): string {
    const configured = this.container.client.options.defaultPrefix;
    return (Array.isArray(configured) ? configured[0] : configured) ?? '?';
  }
}
