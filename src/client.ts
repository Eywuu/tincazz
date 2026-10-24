import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LogLevel, SapphireClient } from '@sapphire/framework';
import { GatewayIntentBits } from 'discord.js';
import type { Env } from './config/env.js';

const logLevels: Record<Env['LOG_LEVEL'], LogLevel> = {
  trace: LogLevel.Trace,
  debug: LogLevel.Debug,
  info: LogLevel.Info,
  warn: LogLevel.Warn,
  error: LogLevel.Error,
  fatal: LogLevel.Fatal,
};

export function createClient(env: Env) {
  const client = new SapphireClient({
    defaultPrefix: env.COMMAND_PREFIX,
    // Required for prefix commands: this loads the listeners that turn messages into command runs.
    loadMessageCommandListeners: true,
    logger: { level: logLevels[env.LOG_LEVEL] },
    // Never ping anyone by default; a command that needs to must opt in per message.
    allowedMentions: { parse: [], repliedUser: false },
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      // Privileged: must also be enabled in the Developer Portal (Bot -> Message Content Intent).
      GatewayIntentBits.MessageContent,
    ],
  });

  // Load commands/ and listeners/ relative to this file, so it works from both src/ (tsx) and dist/.
  client.stores.registerPath(dirname(fileURLToPath(import.meta.url)));

  return client;
}
