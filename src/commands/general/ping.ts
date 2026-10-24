import { Command } from '@sapphire/framework';
import type { ChatInputCommandInteraction, Message } from 'discord.js';

export class PingCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, {
      name: 'ping',
      description: 'Shows the bot latency',
    });
  }

  public override registerApplicationCommands(registry: Command.Registry) {
    registry.registerChatInputCommand((builder) =>
      builder.setName(this.name).setDescription(this.description),
    );
  }

  public override async chatInputRun(interaction: ChatInputCommandInteraction) {
    const { resource } = await interaction.reply({ content: 'Pinging...', withResponse: true });
    const roundTrip = (resource?.message?.createdTimestamp ?? 0) - interaction.createdTimestamp;
    await interaction.editReply(this.formatPong(roundTrip));
  }

  public override async messageRun(message: Message) {
    const reply = await message.reply('Pinging...');
    const roundTrip = reply.createdTimestamp - message.createdTimestamp;
    await reply.edit(this.formatPong(roundTrip));
  }

  private formatPong(roundTrip: number) {
    const heartbeat = Math.round(this.container.client.ws.ping);
    return `Pong! Round trip: ${roundTrip}ms, gateway heartbeat: ${heartbeat}ms`;
  }
}
