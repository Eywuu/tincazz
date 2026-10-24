import { Listener } from '@sapphire/framework';
import type { Client } from 'discord.js';
import { parseEnv } from '../config/env.js';
import { startPresence } from '../features/presence/index.js';

export class ReadyListener extends Listener {
  public constructor(context: Listener.LoaderContext) {
    super(context, { once: true, event: 'clientReady' });
  }

  public override run(client: Client<true>) {
    this.container.logger.info(
      `Logged in as ${client.user.tag} (${client.guilds.cache.size} guilds)`,
    );
    startPresence(client, parseEnv(process.env).GUILD_ID);
  }
}
