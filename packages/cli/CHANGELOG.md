# @storagesdk/cli

## 0.2.0

### Minor Changes

- ddf8685: Forks gain `merge`, `rebase`, and `diff` — three-way merge/rebase against the fork's base snapshot, and a two-way diff preview.

  `merge` and `rebase` propagate adds, modifications (etag or `lastModified` disambiguates overlap; newest wins), and deletes. Both return a `SnapshotInfo` of the destination's post-op state — `merge` snapshots the parent; `rebase` snapshots the fork.

  `diff` is a two-way tree diff between fork and parent in the chosen direction (`'ahead'` = fork vs parent, `'behind'` = parent vs fork). Not a strict merge preview — the mutating ops apply a source-wins-with-tiebreakers policy against the fork's base, so a path reported as `modified` may or may not be touched by an actual merge. Callers who need the exact write set should run the op on a throwaway snapshot fork.

  `MergeOptions`, `RebaseOptions`, and `DiffOptions` carry only `signal` (plus `direction` on diff). No source-side snapshot overrides — the two-op "reset to snapshot, then merge/rebase" workflow covers the milestone-pinning use case explicitly.

  `Storage.forks.create({ name })` auto-snapshots the parent when no `fromSnapshot` is passed, so the three-way diff always has a base for the mutating ops. The auto-snapshot appears in `snapshots.list()`.

  `AdapterForks.merge`, `.rebase`, and `.diff` are required on the contract. `defaultMerge`, `defaultRebase`, and `defaultDiff` are exported from `@storagesdk/core/adapter` for adapters that want the polyfills. Merge/rebase polyfill's per-path classifier is etag-first — content-hash (git blob SHA, S3 etag, GCS/Azure content-hash) is the primary discriminator; `lastModified` is a fallback for adapters that only surface mtime. Diff polyfill is a straight source-vs-dest tree walk.

  Adapters with native APIs override:
  - **Tigris** — `mergeFork` for merge, `rebaseFork` for rebase. Diff on polyfill.
  - **GitHub** — `repos.merge` for both merge and rebase (swapped base/head); `compareCommitsWithBasehead` for diff, splitting renames into delete+add for parity with rename-blind adapters. Truncation at github's 300-file cap surfaces as `NotSupported`.
  - **Mesa** — `bookmarks.merge` for both merge and rebase (swapped target/source); `diffs.get` for diff. Same renames-split and truncation-surface behavior.

  CLI: `storage fork merge <name>`, `storage fork rebase <name>`, `storage fork diff <name>` (`--direction ahead|behind`).

  Bumps `@tigrisdata/storage` to `^3.17.1` for `mergeFork` / `rebaseFork`.

### Patch Changes

- Updated dependencies [ddf8685]
  - @storagesdk/core@0.5.0
  - @storagesdk/adapters@0.9.1
  - @storagesdk/ai@0.4.1

## 0.1.3

### Patch Changes

- Updated dependencies [01a7309]
  - @storagesdk/adapters@0.9.0
  - @storagesdk/ai@0.4.0

## 0.1.2

### Patch Changes

- Updated dependencies [fe9ceea]
- Updated dependencies [06b28f9]
  - @storagesdk/adapters@0.8.0
  - @storagesdk/ai@0.4.0

## 0.1.1

### Patch Changes

- 4f51664: Bundle every adapter's SDK into the published `@storagesdk/cli` tarball. The CLI was previously broken at runtime because `@storagesdk/adapters` declares all backend SDKs (`@aws-sdk/client-s3`, `@tigrisdata/storage`, `@azure/storage-blob`, etc.) as **optional** peer deps — right for library consumers but wrong for a globally-installed CLI: `storage ls --adapter s3` failed with `ERR_MODULE_NOT_FOUND`, or worse silently resolved a stale version of the SDK sitting in some ancestor `node_modules`.

  The fix lives in a pair of `prepack` / `postpack` scripts that inject the adapter peer deps into the CLI's `dependencies` at publish time, then restore the committed `package.json` after. The source tree stays minimal and never drifts; the tarball ships self-contained so `npm install -g @storagesdk/cli` followed by `storage <verb> --adapter <anything>` just works.

## 0.1.0

### Minor Changes

- a921e0a: Add `storage mcp` — a stdio Model Context Protocol server. Wraps `@storagesdk/ai/mcp`'s `createMcpServer` and connects it to `StdioServerTransport`, so any MCP host (Claude Desktop, Cursor, MCP Inspector, etc.) can drive storagesdk. Accepts `--read-only`, `--scope <prefix>`, `--url-expires-in <seconds>`, `--max-inline-bytes <bytes>`. stdout is reserved for JSON-RPC; the readiness line and any errors go to stderr.
- 0d8f142: Add `ls`, `stat`, `cat`, `sign`, `snapshots`, and `forks` commands. Each accepts `--adapter <name>` and falls back to `STORAGE_ADAPTER` env. The four object-read commands take `--snapshot <id>` and `--fork <name>` to scope the read into a snapshot or fork (combo allowed — fork is applied first). `snapshots` and `forks` are list-only. `ls`, `stat`, `sign`, `snapshots`, and `forks` support `--json` (default when piped); `sign` accepts `--ttl <seconds>`. `cat` always streams bytes to stdout — pipe with `>` to save.
- 22f7356: New package: `@storagesdk/cli`. Ships two binary aliases — **`storage`** (primary) and **`storagesdk`** (for searchability) — both pointing at the same script.

  This first release scaffolds the package and ships the `adapters` subcommand, the discovery surface for runtime adapter selection:

  ```sh
  storage adapters
  # Lists every adapter shipped in @storagesdk/adapters.

  storage adapters tigris
  # Shows the env vars an adapter reads, with required/optional flags and
  # backend-native fallbacks. Pipe to `jq` or use `--no-json` to override
  # the automatic TTY-detect formatting.
  ```

  Output formatting is TTY-aware: human-readable when stdout is a terminal, JSON when piped. `--json` and `--no-json` flags override the detection.

  Subsequent releases will layer on the rest of the CLI surface in focused PRs:
  - **Read commands:** `ls`, `stat`, `get`, `sign`
  - **Write commands:** `put`, `cp`, `mv`, `rm`
  - **Snapshot/fork subcommands:** `storage snapshot {create,ls,stat,rm}`, `storage fork {create,ls,stat,rm}`
  - **MCP server:** `storage mcp` boots a stdio Model Context Protocol server registering the same 18 verbs as `@storagesdk/ai`.

  Adapter config comes from env vars (`TIGRIS_BUCKET`, `S3_ACCESS_KEY_ID`, etc.) — the same convention as `@storagesdk/adapters`'s registry. No per-adapter CLI flags. See `storage adapters <name>` for the exact list per adapter, including backend-native fallbacks like `AWS_*`, `BLOB_READ_WRITE_TOKEN`, `GOOGLE_CLOUD_PROJECT`, `AZURE_STORAGE_ACCOUNT`.

- 550d0e8: Add `cp`, `mv`, `rm`, and `snapshot`/`fork` subcommand groups for management.
  - `storage cp <src> <dst>` and `storage mv <src> <dst>` accept the `storage://` scheme to mark remote paths; everything else is local. `cp` also accepts `-` for stdin (as source) or stdout (as destination). Local→local is rejected.
  - `storage rm <path>` deletes one remote object.
  - `storage snapshot create [--name X]` and `storage snapshot rm <id>` manage snapshots; `storage fork create <name> [--from-snapshot <id>]` and `storage fork rm <name>` manage forks.
  - Write commands accept `--fork <name>` to scope writes; `--snapshot` is rejected with a clear message (snapshots are read-only).
  - `cp` upload supports `--content-type` override.

### Patch Changes

- Updated dependencies [a921e0a]
  - @storagesdk/ai@0.4.0
