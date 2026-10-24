# Tincazz

Discord bot for the cazzwastaken community server, built with TypeScript, discord.js and the
Sapphire framework.

Currently implemented:
- `?ping` / `/ping`: the bot's latency
- `?gamba [bet]` / `/gamba bet:<bet>`: wagered spins with a progressive pot (see below).
  `?gamba` is the classic plain-text reply, `/gamba` the polished card with buttons; both share the
  same economy
- `/balance`, `/daily`, `/bailout`: your coins, the daily streak and a bailout when broke
- `/stats [user]`: a player profile with spins, win rate, biggest win, net profit and daily streak
- `/leaderboard [category]`: the top 10 by `coins`, `biggest-win`, `jackpots`, `profit` or `spins`; only
  the person who ran it can use its category select and Previous/Next buttons
- chat rewards: a few coins for chatting, at most once a minute
- `/eco give|take`: moderators adjust coins (Manage Server)

## Gamba

Every spin costs a stake: `100`, `2.5k`, `all` or `half` (10 to 10,000 coins), or 10 coins when
you give no bet. There are no free spins. A spin pays a multiple of the stake. Payouts include the
stake:

| Result        | Payout |
| ------------- | ------ |
| yt pair       | 1.2x   |
| python pair   | 4x     |
| cpp pair      | 10x    |
| yt triple     | 15x    |
| python triple | 100x   |
| cpp triple    | 300x   |

Every wagered spin adds 3% of the bet (at least 1 coin) to a shared pot. A wagered cpp triple also
wins the pot: all of it at bets of 500 or more, a proportional share below that. The pot starts at
10,000 coins and never resets below that.

`?gamba` replies to you with the reels (plus a follow-up on a win), with no buttons. Every `/gamba`
result card has a **Spin again** button (same bet).
Wagered cards also get **Double (N)**, shown only when twice the bet is at most 10,000 and at
most your balance after the spin. Only the player can use the buttons.

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
cp .env.example .env   # then set DISCORD_TOKEN (and GUILD_ID for instant slash commands)
pnpm dev
```

`DATABASE_PATH` (default `./data/tincazz.db`) is the SQLite file; it is created and migrated on
startup. `GUILD_ID` is optional: when set, slash commands register to that server instantly,
otherwise they register globally, which can take up to an hour.

`.env` is gitignored. Never commit it. Before opening a PR, run the same checks CI does:

```sh
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

See [AGENTS.md](AGENTS.md) for the full list of scripts, conventions and git rules.

## Deploying to a VPS

Every push to `main` that passes CI (lint, typecheck, tests, build) builds a Docker image and
publishes it to `ghcr.io/cazzwastaken/tincazz` (see `.github/workflows/docker.yml`). The server only
needs Docker, `docker-compose.yml` and a `.env` file.

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

### Automatic deploys

The `deploy` job in `docker.yml` runs after a successful publish on `main` and SSHes into the VPS to
pull the new image and restart the bot. It runs in the `production` GitHub environment, which holds
these secrets: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY` (private key) and `VPS_KNOWN_HOSTS` (the output of
`ssh-keyscan -t ed25519 <host>`).

On the VPS, create a dedicated `deploy` user in the `docker` group with the compose project in
`~/tincazz`, and give CI a dedicated key restricted to one command in `~/.ssh/authorized_keys`:

```
command="cd ~/tincazz && docker compose pull && docker compose up -d && docker image prune -f",restrict ssh-ed25519 AAAA... tincazz-ci
```

Set the private key secret from the file so its formatting survives
(`gh secret set VPS_SSH_KEY --env production < <path-to-private-key>`). A leaked key can then do
nothing except redeploy. The job does not update `docker-compose.yml` or
`.env` on the server.

### Manual update

To update to the latest version by hand:

```sh
docker compose pull && docker compose up -d
```

`docker compose pull` only updates the image. When a release changes `docker-compose.yml`, fetch the
new file too (the same `curl` as in the setup above) before running `up -d`.

The container restarts automatically after crashes and reboots (`restart: unless-stopped`). It runs
as a non-root user with a read-only filesystem and no extra capabilities, and its logs are rotated
(3 files of 10 MB), so it will not fill the disk.

The SQLite database lives on the `tincazz-data` Docker volume, mounted at `/app/data` (the only
writable path in the container). To back it up:

```sh
docker compose exec bot node -e "require('better-sqlite3')('/app/data/tincazz.db').backup('/app/data/backup.db')"
docker compose cp bot:/app/data/backup.db .
```

If the bot restarts in a loop with `SqliteError: unable to open database file`
(`SQLITE_CANTOPEN`), the container has no writable `/app/data`. The usual cause is an outdated
`docker-compose.yml` without the `tincazz-data` volume: check that `docker compose config` lists it
under `volumes`, replace the file with the current one and run `docker compose up -d`. Also make sure
`DATABASE_PATH` in `.env` is unset or points inside `/app/data`.

To roll back, set the `image:` tag in `docker-compose.yml` to an earlier build (every image is also
tagged `sha-<commit>`, and `v*` git tags publish versioned images), then run
`docker compose up -d`. Switch back to `latest` to follow `main` again.

## License

Released under the [GNU General Public License v3.0](LICENSE) (GPL-3.0-only).
