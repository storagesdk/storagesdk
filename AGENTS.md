# AGENTS.md

Guidance for AI agents and contributors working in this repo. Read this before making non-trivial changes.

## What this is

storagesdk is a vendor-neutral SDK for object storage. One API across providers (S3, R2, GCS, Azure, Tigris, filesystem), with **snapshot** and **fork** as core operations alongside upload, download, delete, list, copy, move, and signed URLs.

The design lives in [`docs/RFC.md`](docs/RFC.md). The implementation plan lives in [`docs/PLAN.md`](docs/PLAN.md). Read those before proposing API or architecture changes.

## Locked design decisions

These are decided. Don't re-litigate without a clear reason.

- **Errors:** operations throw `StorageError`. No Result type.
- **Verbs:** `upload`, `download`, `delete`, `head`, `list`, `copy`, `move`, `url`, `uploadUrl`.
- **`StorageItem`** is the return type for `download`, `head`, and items from `list`. Plain object with metadata fields (`path`, `size`, `contentType`, `etag`, `lastModified`, `metadata`) plus lazy body accessors (`blob`, `text`, `arrayBuffer`, `bytes`, `stream`).
- **Paths are normalized at the `Storage` layer.** Leading slashes stripped, empty paths rejected. Adapters always see clean paths.
- **No bucket vocabulary in the public API.** The storage location is the adapter's concern.
- **Snapshot is a handle**, not an option on read methods. Use `snap.download(path)`, not `storage.download(path, { snapshot: id })`.
- **Snapshot and fork are core operations.** Every shipped adapter implements them, natively or via the default `defineAdapter` implementation.
- **No capability flags** for user code to check at runtime.
- **`defineAdapter`** is the single adapter authoring entry point. It fills in default `snapshots` and `fork` using the 8 basic operations when the adapter doesn't supply them.
- **Module format:** ESM-only. No CJS output.
- **Build:** plain `tsc`, no bundler.
- **Engines:** Node 22+ for the monorepo root; published packages declare Node 20+.
- **Streaming:** `download(path, { as: 'stream' })` always returns a Web `ReadableStream`.

## Working principles

- **Add only what's used.** No speculative dependencies. No config that restates defaults. No files the tool would generate itself on first run. If unsure, leave it out and let need surface.
- **No caveats, no workarounds.** If a setup choice produces a warning or needs to be papered over, change the choice. Don't add a workaround.
- **Plain writing.** No "roster", "moot", "first-class citizens", "surface area", or other LLM/MBA-flavored words. Write like a person.
- **Independent SDK lens.** Design as if shipping on npm independently. Tigris-specific features ride on a vendor-neutral primitive, not as vocabulary in the public API.

## Gates

Before opening a PR, every command below must pass cleanly:

```sh
pnpm install
pnpm check
pnpm typecheck
pnpm build
pnpm test
pnpm publint
```

CI runs the same gates on Node 20, 22, and 24.

## Commits and PRs

- **Conventional commits.** Format: `type(scope): subject`. Types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `build`, `ci`, `perf`, `style`, `revert`. Subject is imperative mood, lowercase, no trailing period. Scope is optional and names the package or area, e.g. `core`, `s3`, `release.yml`.
- **Never commit without explicit confirmation.** When the changes are ready, surface the proposed commit message and the file list to the user and wait for their go-ahead. Same for amending.
- **Never push or open a PR without explicit confirmation.** Show the proposed PR title and description and wait for approval before running `git push` or `gh pr create`.
- **Keep PR title and description in sync with the branch.** When pushing a new commit to an existing PR, update the PR title and description if the change shifts what the PR is doing. Don't leave a stale title from the first commit.

## Releasing

Changes that affect a published package's behavior or API need a changeset:

```sh
pnpm changeset
```

Pick the affected packages, the bump type (`patch`, `minor`, `major`), and write a short description. CI publishes when the release PR merges to `main`, using OIDC trusted publishing (no npm token).
