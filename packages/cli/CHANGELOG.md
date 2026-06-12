# @storagesdk/cli

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
