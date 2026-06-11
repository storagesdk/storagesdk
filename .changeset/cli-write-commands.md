---
'@storagesdk/cli': minor
---

Add `cp`, `mv`, `rm`, and `snapshot`/`fork` subcommand groups for management.

- `storage cp <src> <dst>` and `storage mv <src> <dst>` accept the `storage://` scheme to mark remote paths; everything else is local. `cp` also accepts `-` for stdin (as source) or stdout (as destination). Local→local is rejected.
- `storage rm <path>` deletes one remote object.
- `storage snapshot create [--name X]` and `storage snapshot rm <id>` manage snapshots; `storage fork create <name> [--from-snapshot <id>]` and `storage fork rm <name>` manage forks.
- Write commands accept `--fork <name>` to scope writes; `--snapshot` is rejected with a clear message (snapshots are read-only).
- `cp` upload supports `--content-type` override.
