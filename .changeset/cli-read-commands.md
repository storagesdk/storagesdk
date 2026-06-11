---
'@storagesdk/cli': minor
---

Add `ls`, `stat`, `cat`, `sign`, `snapshots`, and `forks` commands. Each accepts `--adapter <name>` and falls back to `STORAGE_ADAPTER` env. The four object-read commands take `--snapshot <id>` and `--fork <name>` to scope the read into a snapshot or fork (combo allowed — fork is applied first). `snapshots` and `forks` are list-only. `ls`, `stat`, `sign`, `snapshots`, and `forks` support `--json` (default when piped); `sign` accepts `--ttl <seconds>`. `cat` always streams bytes to stdout — pipe with `>` to save.
