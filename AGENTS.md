# AGENTS.md

Guidance for AI coding agents and contributors working in this repository.

## Project

Tincazz is a Discord bot for managing the cazzwastaken community server. It is expected to grow
into a large, feature-rich bot, so structure and conventions matter more than speed.

## Stack

- TypeScript (strict), ESM, Node.js 24+
- [discord.js](https://discord.js.org) on top of the [Sapphire framework](https://www.sapphirejs.dev)
- [zod](https://zod.dev) for validating configuration
- pnpm, [Biome](https://biomejs.dev) (lint + format), [Vitest](https://vitest.dev)
- Docker + GitHub Actions (CI, image published to GHCR), Dependabot for dependency updates

## Commands

| Command            | Purpose                                              |
| ------------------ | ---------------------------------------------------- |
| `pnpm dev`         | Run with reload (`tsx watch`), loads `.env`          |
| `pnpm build`       | Compile `src/` to `dist/`                            |
| `pnpm start`       | Run the compiled bot                                 |
| `pnpm lint`        | Biome lint + format check (`lint:fix` to apply)      |
| `pnpm typecheck`   | `tsc --noEmit` over `src/` and `test/`               |
| `pnpm test`        | Run Vitest                                           |
| `pnpm db:generate` | Generate a Drizzle migration from `src/db/schema.ts` |

Before considering any change done, `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
must pass. CI runs exactly these.

## Layout

```
src/
  index.ts        entry point: parse env, create client, log in, handle shutdown
  client.ts       builds the SapphireClient (intents, logger, mention policy, piece path)
  config/env.ts   zod schema for environment variables
  db/             SQLite schema (Drizzle) and `openDatabase`, exposed as `container.db`
  commands/       one file per command, grouped in folders by category
  features/       plain feature logic, one folder per feature (not auto-loaded)
  listeners/      one file per Discord/Sapphire event listener
drizzle/          generated SQL migrations, committed and shipped in the image
test/             Vitest tests
.github/          CI, image publishing and Dependabot configuration
```

Sapphire loads every file under `commands/` and `listeners/` automatically (and would do the same
for `preconditions/`, `interaction-handlers/`, `arguments/` if added). Do not register pieces by
hand. Pieces export a class extending `Command`, `Listener`, etc. `interaction-handlers/` arrives
in phase 3 of the gamba economy.

## Database

- SQLite through better-sqlite3 and Drizzle. Migrations from `drizzle/` are applied on startup.
- Change `src/db/schema.ts`, then run `pnpm db:generate --name <change>` and commit both. CI fails
  when the schema and the migrations drift apart.
- Coin amounts and timestamps (epoch milliseconds, UTC) are integers.
- Tests use `openDatabase(':memory:')` and assign `container.db`.
- `better-sqlite3` must stay `true` in `allowBuilds` in `pnpm-workspace.yaml`, or its native binary
  is never built.

## Discord and Sapphire notes

- **Prefix commands need `loadMessageCommandListeners: true`** in `src/client.ts`. Without it the
  bot receives messages but never runs a command, and nothing is logged. Do not remove it. A test
  guards this.
- **Mentions are suppressed by default** (`allowedMentions: { parse: [], repliedUser: false }`).
  A command that must ping someone has to opt in explicitly for that message.
- **Slash commands register to `GUILD_ID` when it is set**, otherwise globally (global updates can
  take up to an hour). Each command implements `registerApplicationCommands` and `chatInputRun`.
- **`?gamba` jackpot assigns a role**, so the bot needs the **Manage Roles** permission and its
  highest role must sit above the jackpot role.
- Prefix commands rely on the privileged **Message Content** intent. Prefer slash commands
  (`chatInputRun`) for new user-facing features, and add a gateway intent only when a feature needs
  it.

## Conventions

- Use `.js` extensions in relative imports (NodeNext ESM), and `import type` for type-only imports.
- Read configuration only through `parseEnv` in `src/config/env.ts`. Add new variables to the zod
  schema **and** to `.env.example` in the same commit. Do not read `process.env` elsewhere.
- Feature logic goes in `src/features/<name>/` with an `index.ts` public surface; commands and
  listeners stay thin and call into it. Game/feature config (emojis, odds, role IDs) lives in the
  feature folder.
- Log through `this.container.logger` / `client.logger`, not `console`.
- Keep logic that can be tested without Discord in plain functions and cover it with Vitest.
- New behavior and bug fixes come with tests in `test/`. To test a command end to end, build the
  client with `createClient`, load the stores, emit `Events.MessageCreate` with a stubbed message
  and assert on the replies (see `test/ping.test.ts`). No network or real token is needed.
- Add dependencies with `pnpm add` (no hand-edited versions). Keep `pnpm-lock.yaml` committed.

## CI/CD

- `.github/workflows/ci.yml` runs lint, typecheck, tests, build and a migration drift check
  (`pnpm db:generate` must leave `drizzle/` unchanged). It runs on pull requests (which
  also build the Docker image without pushing) and is reused by the publish workflow.
- `.github/workflows/docker.yml` runs on pushes to `main` and `v*` tags. It calls CI first and
  publishes the image to `ghcr.io/cazzwastaken/tincazz` only if CI passes.
- Dependabot opens weekly PRs for npm, GitHub Actions and the Docker base image, using
  conventional prefixes (`chore(deps)`, `ci(deps)`, `build(deps)`).
- Node major versions are ignored by Dependabot and upgraded by hand, only to LTS releases (update
  `.node-version`, `package.json` engines and the Dockerfile together). Newer images can drop tools
  the Dockerfile relies on: `node:25` no longer ships corepack, so `corepack enable` fails there.
- Do not merge a PR with failing checks.

## Git rules

- Make **all changes in logical commits**: one coherent change per commit, never a single dump of
  unrelated work. Each commit should leave `lint`, `typecheck`, `test` and `build` passing.
- Follow [Conventional Commits](https://www.conventionalcommits.org): `type(scope): summary`.
  - Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`,
    `revert`.
  - Summary is imperative, lower case, no trailing period, about 72 characters or fewer
    (`feat(moderation): add timeout command`).
  - Use the body to explain _why_ when it is not obvious. Mark breaking changes with `!` and a
    `BREAKING CHANGE:` footer.
- Work on a branch and open a pull request for anything non-trivial; do not force-push `main`.
- Do not commit generated output (`dist/`, `node_modules/`) or anything listed in `.gitignore`.

## Secrets and security

This repository is **public**. Never commit tokens, keys, `.env` files, server/user IDs that are
meant to stay private, or logs containing them.
- Real values live only in `.env` (gitignored) locally and in the `.env` file on the server.
  `.env.example` documents the variables with empty or safe placeholder values.
- The Docker image contains no secrets; they are injected at runtime through `env_file`.
- Never log the token or print the full environment.
- If a token is ever committed or pasted anywhere public, treat it as compromised: reset it in the
  Discord Developer Portal immediately (removing it from git history is not enough).
- Request only the gateway intents the bot actually needs. `MessageContent` is privileged.
