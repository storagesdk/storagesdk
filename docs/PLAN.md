# storagesdk implementation plan

A working plan for getting from greenfield to a publishable v1.

## Tooling

All versions pinned to the latest stable at setup time; the list below names the tool, not a version.

- **Package manager:** pnpm (latest 10.x), `packageManager` pinned in root `package.json`
- **Versioning and releases:** changesets, `commit: false`, public access
- **Editor defaults:** `.editorconfig` at the repo root for indent, line endings, charset, final-newline, trim-trailing-whitespace. Covers editor-typing behavior before save and handles file types Biome doesn't format (md, yaml, sh, env).
- **Linter / formatter:** Biome (latest 2.x). Single quotes, 2-space indent, 80-col, semicolons.
- **TypeScript:** latest stable, strict mode, target ES2022, `module: NodeNext`. Engines `node >= 22` for the monorepo root; published packages declare `node >= 20`.
- **Module format:** ESM-only. No CJS output. Modern best practice for a fresh library in 2026.
- **Build:** `tsc` alone (no bundler). Emits `.js` (ESM), `.d.ts`, source maps, and declaration maps to each package's `dist/`. Consumers' bundlers handle minification.
- **Tests:** vitest (latest)
- **Package validation:** publint
- **Git hooks:** simple-git-hooks (zero-dep, configured in root `package.json`). Pre-commit runs `biome check --write` on staged files.
- **CI:** GitHub Actions — `ci.yml` (lint, typecheck, build, test) and `release.yml` (changesets publish with `--provenance`)

Deliberately not included for v1: knip, attw, husky, lefthook, tsup. Revisit if a real problem surfaces.

## Repo layout

```
storagesdk/
├── package.json                # root, private, scripts orchestrate workspace
├── pnpm-workspace.yaml
├── pnpm-lock.yaml
├── tsconfig.base.json
├── biome.json
├── .changeset/
├── .github/workflows/
├── packages/
│   ├── core/                   # @storagesdk/core
│   │   ├── src/
│   │   ├── test/
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── tsconfig.build.json
│   └── adapters/
│       ├── fs/                 # @storagesdk/fs
│       ├── s3/                 # @storagesdk/s3
│       ├── tigris/             # @storagesdk/tigris
│       └── ...
├── examples/
│   ├── quickstart/
│   ├── snapshot-restore/
│   ├── fork-experiment/
│   └── browser-upload/
└── docs/
    ├── RFC.md
    └── PLAN.md
```

## Phases

The phases are sequential through phase 3, then parallelizable.

### Phase 0 — repo + tooling

Get the monorepo skeleton in place so every later phase has somewhere to land.

- Root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `biome.json`
- `.changeset/config.json`
- CI: lint + typecheck + build + test on PR
- Release: changesets publish on push to main
- Empty `@storagesdk/core` package with build, test, publint scripts wired

Exit: `pnpm install && pnpm build && pnpm test` runs cleanly on an empty repo.

### Phase 1 — core types and classes

Land the API shape from the RFC. No real adapter yet — use an in-memory test adapter to exercise the surface.

- `StorageError` with `code` (`NotFound | NotSupported | Conflict | Unauthorized | InvalidArgument | Provider`) and `cause`
- Types: `StorageItemMeta` (metadata only), `StorageItem` (extends `StorageItemMeta` with `body: Uint8Array`), `ListResult`, `UploadUrlResult` (discriminated PUT/POST), `SnapshotInfo`, `ForkInfo`, `UploadOptions`, `ListOptions`, `UploadUrlOptions`, `UrlOptions`, `ForkOptions`, `CreateSnapshotOptions`, progress types
- Interfaces:
  - `ReadOnlyAdapter` (the four read methods: `download`, `head`, `list`, `url`)
  - `AdapterSnapshots` and `AdapterForks` — the two namespace contracts. Each has five methods (`create`, `list`, `head`, `delete`, `get`). Exported so adapter authors can implement them in isolation.
  - `Adapter` extends `ReadOnlyAdapter` with writes (`upload`, `delete`, `copy`, `move`, `uploadUrl`) plus `snapshots: AdapterSnapshots` and `forks: AdapterForks`.
  - `AdapterSnapshots.get(id)` returns `ReadOnlyAdapter`. `AdapterForks.get(name)` returns `Adapter`.
- Classes:
  - `ReadOnlyStorage` — wraps a `ReadOnlyAdapter`. Provides overloaded `download` (`as: 'stream' | 'text' | 'bytes' | 'blob' | 'json'`) and the other read methods. Exported as **type only** from `@storagesdk/core` (no public constructor; instances come from `storage.snapshots.get(id)`).
  - `Storage` extends `ReadOnlyStorage`. Adds writes, plus `snapshots` and `forks` namespaces declared with inline types (the consumer-facing shape — distinct from the adapter-facing `AdapterSnapshots` / `AdapterForks`). Decoupled from `Adapter` (does not `implements Adapter`).
- `storage.snapshots.get(id)` returns a `ReadOnlyStorage`; `storage.forks.get(name)` returns a `Storage`.
- No `storage.fork()` method — call `storage.forks.create()`.
- `defineAdapter(impl)` — wraps every path-taking method with `normalizePath`; normalizes paths on readers returned by `snapshots.get`; recursively re-wraps adapters returned by `forks.get`. For now, requires the full Adapter shape (no defaults yet).
- `toWebStream` utility for adapters that get Node `Readable` or other body shapes
- In-memory test adapter in `core/test` exercising the full surface

Exit: tests cover every method on `Storage`, `ReadOnlyStorage`, the snapshots namespace, and the forks namespace against the in-memory adapter. Types are tight enough that omitting a method from a `defineAdapter` call is a TypeScript error.

### Phase 2 — snapshot and fork convention

`snapshots` and `forks` stay required on the `Adapter` contract — there is no SDK-level polyfill. Phase 2 locks in the on-disk format and naming scheme that copy-based adapters follow, and ships the small set of helpers that own those SDK-defined pieces.

- `Manifest` type: `{ version: 1, parent, snapshots, forks }` written as `.storagesdk.metadata.json` at every SDK-managed location. Uniform shape across top-level / snapshot / fork locations. `readManifest` throws `NotSupported` on an unrecognized version so future schema changes aren't silently misread.
- Snapshot naming: `<parent-location>-snapshot-<nanoseconds>` via `nextSnapshotId(parentLocation)`. The id doubles as the sibling location name.
- Fork naming: user-provided `name`. `forks.create` throws `Conflict` if a location with that name already exists.
- Helpers exported from `@storagesdk/core/adapter`: `Manifest`, `emptyManifest`, `readManifest`, `writeManifest`, `nextSnapshotId`.
- Tests against the in-memory adapter cover the helpers in isolation.

Adapter authors who can't or don't want to support snapshot/fork throw `StorageError` with code `NotSupported` from each method. No silent stubs.

Exit: the convention and the helpers are in place. Phase 3+ adapters consume them.

### Phase 3 — filesystem adapter

The reference adapter. Doubles as the test fixture for everything downstream.

- `@storagesdk/fs`
- 9 basic ops over `node:fs/promises` (`upload`, `download`, `head`, `list`, `delete`, `copy`, `move`, `url`, `uploadUrl`)
- Native snapshot and fork via hardlinks where the platform supports it (fall through to copy when not). Native fork creates a sibling directory and hardlinks every file.
- Streaming download via `Readable.toWeb(fs.createReadStream(...))`
- Signed URLs are just file:// URLs with an expiry timestamp encoded — documented as not-actually-signed, useful for local dev and tests
- Full test suite. This is also where we shake out the API ergonomics for real.

Exit: real I/O works end-to-end. Used as the in-memory adapter's replacement in core tests.

### Phase 4 — S3 adapter

The first cloud adapter. Drives out all the real-world edges.

- `@storagesdk/s3`
- Built on `@aws-sdk/client-s3` (v3, peer dep)
- 9 basic ops, multipart upload via `@aws-sdk/lib-storage`
- Stream normalization via `toWebStream` (handles Node `Readable` and Web `ReadableStream` from the AWS SDK)
- Uses the default snapshot/fork from `defineAdapter` for v1
- Tests against LocalStack or MinIO (TBD — see Testing below)
- Document the `.snapshots/` reserved prefix and the cost of the default fork

Exit: S3 works against a local emulator. CI runs the S3 test suite.

### Phase 5 — Tigris adapter

The native-everything adapter, in parallel with phase 4 once phase 3 is done.

- `@storagesdk/tigris`
- Built on the existing Tigris client (reuse `@tigrisdata/storage` internals where useful)
- 9 basic ops
- Native `snapshots` (delegates to Tigris's snapshot API)
- Native `fork` (delegates to `createBucket({ sourceBucketName, sourceBucketSnapshot })`, returns a new `Storage` wrapping the Tigris adapter at the new bucket)
- Live tests against a real Tigris bucket in CI (gated on secrets)

Exit: Tigris works with the same end-user code as S3, including snapshot and fork.

### Phase 6 — examples

Each example is a separate package under `examples/` with its own `package.json` so people can copy them out and run them.

- `examples/quickstart` — upload, download, list, delete
- `examples/snapshot-restore` — make a snapshot, mutate the storage, read at snapshot, restore
- `examples/fork-experiment` — fork, experiment, optionally promote (or just toss)
- `examples/browser-upload` — server route that issues `uploadUrl`, browser client that PUTs the file directly
- Top-level README that points to each example

Exit: every example runs against the FS adapter with `pnpm dev` from the example directory.

### Phase 7 — remaining adapters (post-v1 stretch)

In rough order of effort:

- `@storagesdk/r2` — Cloudflare R2 via the S3-compatible API. Likely a thin wrapper that imports the S3 adapter with different defaults.
- `@storagesdk/minio` — same.
- `@storagesdk/do-spaces` — same.
- `@storagesdk/gcs` — Google Cloud Storage via `@google-cloud/storage`.
- `@storagesdk/azure` — Azure Blob via `@azure/storage-blob`. Has native snapshots — implement them.
- Optional: `s3VersioningSnapshot` building block for adapter authors who want a cheaper snapshot path on top of S3.

### Phase 8 — release

- First publish as `0.1.0-alpha.0` with `pnpm release`
- Set up release notes via changesets
- README polish
- Decide on a docs site (after v1 ships, not before)

## Testing strategy

Three layers, all under vitest:

1. **Unit tests in core.** Cover every method on `Storage` and `Snapshot` against an in-memory adapter. Run on every PR. Fast.
2. **Adapter conformance tests.** A shared test suite in `@storagesdk/core/test/conformance` (or similar) that every adapter runs against its own implementation. Same tests across S3, Tigris, FS — guarantees the API behaves identically.
3. **Live tests.** S3 against LocalStack or MinIO in CI; Tigris against a real bucket gated on repo secrets. Skipped on PRs from forks.

Open question: LocalStack vs MinIO for S3 local tests. MinIO is closer to real S3 semantics for most ops and is what the conformance suite cares about. LocalStack covers more of AWS but is heavier. Lean MinIO unless we hit a feature gap.

## Decisions to settle during implementation

These aren't blockers — they get answered when the code forces the question.

1. **Multipart fallback.** For adapters without native multipart, a single PUT works fine for moderate sizes — but at some size it's better to error than silently degrade. Set a threshold (e.g., 5 GB single-PUT cap on S3) and throw with a clear message.
2. **Whether `storage.copy('a', 'b')` should preserve metadata.** Probably yes, but the default for some adapters is to drop user metadata on copy. Per-adapter decision, tested in conformance suite.
3. **S3 fork destination creation.** S3 bucket names are globally unique; `forks.create` can fail at create. Decide whether to surface `Conflict` cleanly or require destination pre-creation.

## Out of scope for v1

- Documentation site (post-v1)
- AI tool integrations (`@storagesdk/openai`, etc.) — defer
- Bucket configuration APIs (CORS, lifecycle, ACLs, TTL) — in `raw` for now
- Cross-snapshot copy and cross-storage migration helpers — useful but not core
