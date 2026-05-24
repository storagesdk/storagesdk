# AGENTS.md

Guidance for AI agents and contributors working in this repo. Read this before making non-trivial changes.

## What this is

storagesdk is a vendor-neutral SDK for object storage. One API across providers (S3, Tigris, filesystem today; more adapters in the pipeline), with **snapshot** and **fork** as core operations alongside upload, download, delete, list, copy, move, and signed URLs.

The design lives in [`docs/RFC.md`](docs/RFC.md). The implementation plan lives in [`docs/PLAN.md`](docs/PLAN.md). Read those before proposing API or architecture changes.

## Locked design decisions

These are decided. Don't re-litigate without a clear reason.

- **Errors:** operations throw `StorageError`. No Result type. Codes: `NotFound | NotSupported | Conflict | Unauthorized | InvalidArgument | Provider`.
- **Verbs:** `upload`, `download`, `delete`, `head`, `list`, `copy`, `move`, `url`, `uploadUrl`.
- **Two item types.** `StorageItemMeta` (metadata only) is returned by `head` and as items inside `list`. `StorageItem` extends `StorageItemMeta` with `readonly body: Uint8Array` and is returned by `download`. No body accessors / closures.
- **Storage and Adapter are decoupled.** `Adapter` is the contract adapter authors implement (and `defineAdapter` accepts). `Storage` and `ReadOnlyStorage` are the consumer classes. They do NOT `implements Adapter` — they evolve independently. Notably, `Storage.download` / `ReadOnlyStorage.download` are overloaded (`as: 'stream' | 'text' | 'bytes' | 'blob' | 'json'`); `Adapter.download` is a single-signature method that returns `StorageItem`.
- **Interface hierarchy.** `ReadOnlyAdapter` has the four read methods (`download`, `head`, `list`, `url`). `Adapter` extends it with writes plus the `snapshots: AdapterSnapshots` and `forks: AdapterForks` namespaces. `AdapterSnapshots` and `AdapterForks` are exported interfaces so adapter authors can implement them in isolation. No combined `Snapshot` or `Fork` types — namespace methods return info or adapters separately.
- **`AdapterSnapshots` and `AdapterForks` are symmetric.** Both have `create`, `list`, `head`, `delete`, `get`. `head(id)` returns `SnapshotInfo` / `ForkInfo`. `create` returns `SnapshotInfo` / `ForkInfo` too. `AdapterSnapshots.get(id)` returns `ReadOnlyAdapter` (a reader). `AdapterForks.get(name)` returns `Adapter` (full storage).
- **Storage class** wraps `snapshots.get` and `forks.get` returns in `ReadOnlyStorage` and `Storage` respectively so consumers keep the download overloads on snapshot readers and forks. The `snapshots` and `forks` properties on `Storage` use inline types (not named interfaces) — they're consumer-facing shapes, not part of the adapter contract. No `storage.fork()` method — call `storage.forks.create(opts)`.
- **`ReadOnlyStorage` is exported as a type only.** Consumers receive `ReadOnlyStorage` instances from `storage.snapshots.get(id)`; there is no public constructor. `Storage` is the only constructible class.
- **`Raw` generic on `Adapter` and `Storage`.** `Adapter<Raw = unknown>` exposes a typed `raw: Raw` escape hatch. `Storage<Raw>`, `StorageOptions<Raw>`, `AdapterForks<Raw>`, and `defineAdapter<Raw>` all flow it through; `forks.get(name)` returns `Storage<Raw>` so the typed escape hatch survives fork navigation. Adapter authors who want it declare e.g. `Adapter<S3Client>` as the factory return type — `Raw` is otherwise inferred from the impl's `raw` field. Adapters that don't bother get the default `unknown` behavior unchanged.
- **Multipart auto-decide lives in the SDK, not the adapter.** `Storage.upload` resolves `opts.multipart` before calling the adapter: explicit `true`/`false` wins; otherwise size-known bodies multipart only above `opts.multipartThreshold` (default 5 MB), and `ReadableStream`s always multipart (size unknown upfront). Adapters that support multipart (e.g. S3) just check `opts.multipart === true`; adapters that don't (FS, in-memory) ignore it.
- **Snapshot identity is SDK-assigned (`id`); fork identity is user-provided (`name`).** `snapshots.create(opts)` returns a system-generated `id`. `forks.create(opts)` accepts a `name` which is the fork's identifier; you call `forks.get(name)` to address it.
- **Paths are normalized inside `defineAdapter`.** Leading slashes stripped, empty paths throw `StorageError`. Adapter implementations always see clean paths. Authors who construct an `Adapter` literal without `defineAdapter` are responsible themselves.
- **No bucket vocabulary in the public API.** The storage location is the adapter's concern.
- **Snapshot and fork are core operations.** `snapshots` and `forks` are required on every `Adapter` — there is no SDK-level polyfill. Adapters that can't support either throw `StorageError` with code `NotSupported` from each method.
- **Two entry points on `@storagesdk/core`.** `@storagesdk/core` is the consumer entry: `Storage`, `StorageError`, and the types end-user code handles. `@storagesdk/core/adapter` is the adapter-authoring entry: re-exports the consumer entry plus `defineAdapter`, the contract types (`Adapter`, `ReadOnlyAdapter`, `AdapterSnapshots`, `AdapterForks`), `Manifest` helpers, and `toWebStream`. Adapter packages always import from `@storagesdk/core/adapter`.
- **Snapshot and fork convention** (copy-based adapters). Each snapshot/fork is a sibling location (a new bucket / a new folder). Snapshots are named `<parent-location>-snapshot-<13-digit-ms><12-digit-random>` (use `nextSnapshotId`); forks are named by the user (`Conflict` on collision). Each location carries a `.storagesdk.metadata.json` with the same `Manifest` shape: `{ version: 1, parent, snapshots, forks }`. `readManifest` throws `NotSupported` on an unrecognized version. The SDK owns the format and naming via the `Manifest`, `emptyManifest`, `readManifest`, `writeManifest`, and `nextSnapshotId` exports from `@storagesdk/core/adapter`. Everything else — creating the sibling location, copying entries, progress reporting — is the adapter's job.
- **No capability flags** for user code to check at runtime.
- **`defineAdapter`** is the single adapter authoring entry point. It wraps every path-taking method with path normalization, normalizes paths on readers returned by `snapshots.get`, and recursively re-wraps adapters returned by `forks.get`.
- **Module format:** ESM-only. No CJS output.
- **Build:** plain `tsc`, no bundler.
- **Engines:** Node 22+ for the monorepo root; published packages declare Node 20+.
- **Streaming:** `Storage.download(path, { as: 'stream' })` always returns a Web `ReadableStream`.

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

## Running tests

Tests treat the SDK like a user would: the bucket/root the adapter is pointed at must exist before the test starts, and the credentials must already have sufficient rights. Tests never create infrastructure; they isolate per-test by key prefix and clean up via the SDK itself.

- **Core + FS**: no setup. `pnpm test` works out of the box. FS defaults to `os.tmpdir()`.
- **S3 (MinIO)**: requires a pre-existing bucket.

    ```sh
    # One-time: start MinIO and create the test bucket.
    docker compose up -d minio
    aws --endpoint-url http://localhost:9000 \
        --no-sign-request \
        s3 mb s3://storagesdk-test
    # (or use any S3 client — `mc`, the AWS Console, etc.)

    # Run the S3 suite:
    S3_TEST_BUCKET=storagesdk-test pnpm --filter @storagesdk/adapters test
    ```

    Override any other connection setting via `S3_TEST_ENDPOINT`, `S3_TEST_REGION`, `S3_TEST_ACCESS_KEY_ID`, `S3_TEST_SECRET_ACCESS_KEY`, `S3_TEST_FORCE_PATH_STYLE`. Defaults match the MinIO `docker compose` stack.

- **Tigris**: requires a live bucket and credentials.

    ```sh
    TIGRIS_BUCKET=<your-bucket> \
    TIGRIS_ACCESS_KEY_ID=<...> \
    TIGRIS_SECRET_ACCESS_KEY=<...> \
    pnpm --filter @storagesdk/adapters test
    ```

    The Tigris suite skips entirely when any of those env vars is missing or empty.

The S3 and Tigris suites use diff-based cleanup: on setup they snapshot what already exists in the bucket; on teardown they delete only what this test created. Multiple concurrent runs against the same backend don't collide on cleanup, but they will share the bucket's namespace — use distinct buckets for parallel CI shards.

### Conformance suite

The shared cross-adapter behavior is in `packages/adapters/src/test-suite.ts`. Each adapter's test file is a thin setup/dispose call plus an "implementation" describe block holding adapter-specific tests (sidecar files, multipart, presigned-URL fetching). Third-party adapter authors will eventually import the suite via `@storagesdk/adapters/test-suite`.

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
