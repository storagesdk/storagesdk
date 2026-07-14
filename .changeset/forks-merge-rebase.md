---
'@storagesdk/core': minor
'@storagesdk/adapters': patch
'@storagesdk/cli': minor
---

Forks gain `merge`, `rebase`, and `diff` — three-way merge/rebase against the fork's base snapshot, and a two-way diff preview.

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
