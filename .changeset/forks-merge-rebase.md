---
'@storagesdk/core': minor
'@storagesdk/adapters': patch
'@storagesdk/cli': minor
---

Forks gain `merge`, `rebase`, and `diff` — naive three-way ops against the fork's base snapshot.

`merge` and `rebase` propagate adds, modifications (newer `lastModified` wins on overlap; ties skip), and deletes. Both return a `SnapshotInfo` of the destination's post-op state — `merge` snapshots the parent; `rebase` snapshots the fork.

`diff` reports both directions in a single call — `{ ahead, behind }`, each with `added`, `modified`, and `deleted` path lists (named with git semantics from the fork's perspective: `ahead` is what `merge` would land on the parent, `behind` is what `rebase` would land on the fork). No mutations; use it to preview what either op would do. Pass `opts.snapshot` to diff against an arbitrary snapshot id instead of the fork's recorded base.

To make the three-way diff possible, `Storage.forks.create({ name })` now auto-snapshots the parent when the caller didn't pass `fromSnapshot`. Forks created with `fromSnapshot` are unchanged. The auto-snapshot appears in `snapshots.list()`.

`AdapterForks.merge`, `.rebase`, and `.diff` are optional in the contract; `defineAdapter` fills in defaults driven by the adapter's own primitives. Adapters with a native API (Tigris, GitHub) can override directly. `defaultMerge`, `defaultRebase`, and `defaultDiff` are exported from `@storagesdk/core/adapter` for adapters that want to wrap or compose them.

Adapters that can't surface `lastModified` from `head` throw `StorageError` with code `NotSupported` from merge / rebase / diff.

CLI gets `storage fork merge <name>`, `storage fork rebase <name>` (both with `--snapshot` to label the post-op snapshot), and `storage fork diff <name>` (prints `ahead` / `behind`; `--snapshot` overrides the base).
