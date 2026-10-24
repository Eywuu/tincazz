import { Command } from '@sapphire/framework';
import type { Message } from 'discord.js';

export class PingCommand extends Command {
  public constructor(context: Command.LoaderContext) {
    super(context, {
      name: 'ping',
      description: 'Shows the bot latency',
    });
  }

  public override async messageRun(message: Message) {
    const reply = await message.reply('Pinging...');
    const roundTrip = reply.createdTimestamp - message.createdTimestamp;
    const heartbeat = Math.round(this.container.client.ws.ping);
    await reply.edit(`Pong! Round trip: ${roundTrip}ms, gateway heartbeat: ${heartbeat}ms`);
  }
}
