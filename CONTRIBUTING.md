# Contributing

Thanks for your interest. This file covers the workflow rules. For the design and architecture decisions, read [`AGENTS.md`](./AGENTS.md) — it's the authoritative reference for the contract and the locked decisions.

## Local setup

```sh
pnpm install
pnpm build
pnpm test
```

`AGENTS.md` lists the per-adapter env vars for live tests; suites skip themselves when their env vars aren't set, so a default `pnpm test` runs the fs + MinIO + Azurite paths and skips the rest.

## Commits

Use [Conventional Commits](https://www.conventionalcommits.org/) — same thing some teams call "semantic commits".

```
type(scope): subject
```

- **Types:** `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`.
- **Subject:** imperative mood, lowercase, no trailing period. "add range support" not "Added range support."
- **Scope:** optional, names the package or area — `core`, `s3`, `azure`, `release.yml`, etc.

Examples:

```
feat(vercel): vercel blob adapter
fix(gcs): stream listing in copyAllFiles instead of buffering pages
docs: sync core README with root, refresh adapters README
```

If the commit changes the API or behavior of a published package, the commit body explains the why and the trade-offs. Don't restate the diff — the diff is right there.

## Changesets

Any change that affects a published package's behavior, API, or documentation gets a changeset. Run this **after** your code is finalized but **before** opening the PR:

```sh
pnpm changeset
```

Pick the affected packages (`@storagesdk/core`, `@storagesdk/adapters`), the bump (`patch`, `minor`, `major`), and write a short summary. The result is a markdown file under `.changeset/` — commit it as part of the PR.

**Every PR that ships user-facing changes must include a changeset.** Reviewers will ask for one if it's missing.

When you push more commits to a PR that change what's being shipped, update the existing changeset (don't add a second one for the same PR unless it touches a genuinely different package or version bump).

## Pull requests

- **Title and description match the branch.** When you push new commits to an existing PR that shift what the PR is doing, update the PR title and description so they reflect the cumulative changes — not just the first commit. Use `gh pr edit --title …` and `gh pr edit --body …` (or the GitHub UI).
- **Re-check after every push.** PR metadata goes stale fast. Before considering a push "done," read the PR title and description and confirm they still describe what's on the branch.
- **Test plan in the description.** Include what you tested against (local fs/MinIO/Azurite, live cloud backend, etc.) so reviewers know what's actually been exercised.

## Gates

Every PR must pass:

```sh
pnpm check       # biome lint + format
pnpm typecheck
pnpm build
pnpm test
pnpm publint
```

CI runs the same on Node 20, 22, and 24. Pre-commit hooks handle most of the formatting and the root↔core README sync automatically.

## Code style

Follow what's already there. The repo uses Biome with single quotes, 2-space indent, 80-column lines, semicolons. The pre-commit hook auto-formats staged files.

For longer-form architecture and the "don't do X" list, see [`AGENTS.md`](./AGENTS.md).
