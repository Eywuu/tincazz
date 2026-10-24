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
- Docker + GitHub Actions (CI, image published to GHCR)

## Commands

| Command          | Purpose                                         |
| ---------------- | ----------------------------------------------- |
| `pnpm dev`       | Run with reload (`tsx watch`), loads `.env`     |
| `pnpm build`     | Compile `src/` to `dist/`                       |
| `pnpm start`     | Run the compiled bot                            |
| `pnpm lint`      | Biome lint + format check (`lint:fix` to apply) |
| `pnpm typecheck` | `tsc --noEmit` over `src/` and `test/`          |
| `pnpm test`      | Run Vitest                                      |

Before considering any change done, `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
must pass. CI runs exactly these.

## Layout

```
src/
  index.ts        entry point: parse env, create client, log in, handle shutdown
  client.ts       builds the SapphireClient (intents, logger, piece path)
  config/env.ts   zod schema for environment variables
  commands/       one file per command, grouped in folders by category
  listeners/      one file per Discord/Sapphire event listener
test/             Vitest tests
```

Sapphire loads every file under `commands/` and `listeners/` automatically (and would do the same
for `preconditions/`, `interaction-handlers/`, `arguments/` if added). Do not register pieces by
hand. Pieces export a class extending `Command`, `Listener`, etc.

## Conventions

- Use `.js` extensions in relative imports (NodeNext ESM), and `import type` for type-only imports.
- Read configuration only through `parseEnv` in `src/config/env.ts`. Add new variables to the zod
  schema **and** to `.env.example` in the same commit. Do not read `process.env` elsewhere.
- Log through `this.container.logger` / `client.logger`, not `console`.
- Keep logic that can be tested without Discord in plain functions and cover it with Vitest.
- Add dependencies with `pnpm add` (no hand-edited versions). Keep `pnpm-lock.yaml` committed.

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
