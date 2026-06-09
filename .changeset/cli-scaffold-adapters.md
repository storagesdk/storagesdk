---
'@storagesdk/cli': minor
---

New package: `@storagesdk/cli`. Ships two binary aliases — **`storage`** (primary) and **`storagesdk`** (for searchability) — both pointing at the same script.

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
