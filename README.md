# Tincazz

Discord bot for the cazzwastaken community server, built with TypeScript, discord.js and the
Sapphire framework.

Currently implemented: `?ping` replies with the bot's latency.

## Create the bot (once)

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create an
   application.
2. **Bot** tab: reset/copy the token, and enable the **Message Content Intent** (required for
   `?` prefix commands).
3. **OAuth2 -> URL Generator**: scopes `bot`, permissions as needed, then open the URL to invite
   the bot to your server.

## Local development

Requires Node.js 24+ and [pnpm](https://pnpm.io).

```sh
pnpm install
cp .env.example .env   # then set DISCORD_TOKEN
pnpm dev
```

`.env` is gitignored. Never commit it. See [AGENTS.md](AGENTS.md) for the full list of scripts and
conventions.

## Deploying to a VPS

Every push to `main` builds a Docker image and publishes it to
`ghcr.io/cazzwastaken/tincazz` (see `.github/workflows/docker.yml`). The server only needs Docker,
`docker-compose.yml` and a `.env` file.

One-time setup on the VPS (after [installing Docker](https://docs.docker.com/engine/install/)):

```sh
mkdir tincazz && cd tincazz
curl -fsSLO https://raw.githubusercontent.com/cazzwastaken/tincazz/main/docker-compose.yml
curl -fsSL https://raw.githubusercontent.com/cazzwastaken/tincazz/main/.env.example -o .env
chmod 600 .env && nano .env   # set DISCORD_TOKEN
docker compose up -d
docker compose logs -f
```

The first image is published after the first push to `main`. Open the package's settings on GitHub
and set its visibility to **public** (or run `docker login ghcr.io` on the VPS with a token that
has `read:packages`).

To update to the latest version:

```sh
docker compose pull && docker compose up -d
```

The container restarts automatically after crashes and reboots (`restart: unless-stopped`).

## License

Released under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only).
