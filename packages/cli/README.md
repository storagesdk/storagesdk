# @storagesdk/cli

Command-line interface for [storagesdk](https://github.com/storagesdk/storagesdk). Ships two binary aliases — `storage` (primary) and `storagesdk` (for searchability) — both pointing at the same script.

```sh
npm install -g @storagesdk/cli
storage --adapter tigris ls
```

## Install

```sh
# global
npm install -g @storagesdk/cli

# or one-shot via npx (no install)
npx @storagesdk/cli adapters

# or pin to a project
npm install --save-dev @storagesdk/cli
```

After install both `storage` and `storagesdk` are on your PATH and resolve to the same binary. Use whichever feels natural — `storage` is shorter; `storagesdk` is unambiguous for grep/history.

## Discover adapters

`storage adapters` is the discoverability surface for runtime adapter selection — same env-var convention as `@storagesdk/adapters`'s registry.

```sh
storage adapters
# fs
# s3
# r2
# tigris
# ...
# Run `storage adapters <name>` to see env vars.

storage adapters tigris
# Env vars for tigris:
#
#   TIGRIS_BUCKET             required
#   TIGRIS_ACCESS_KEY_ID      required
#   TIGRIS_SECRET_ACCESS_KEY  required
#   TIGRIS_ENDPOINT           optional
#   TIGRIS_FORCE_PATH_STYLE   optional

storage adapters s3
# Env vars for s3:
#
#   S3_BUCKET             required
#   S3_ACCESS_KEY_ID      optional  fallback: AWS_ACCESS_KEY_ID
#   S3_SECRET_ACCESS_KEY  optional  fallback: AWS_SECRET_ACCESS_KEY
#   S3_REGION             optional  fallback: AWS_REGION
#   S3_ENDPOINT           optional
#   S3_FORCE_PATH_STYLE   optional
```

Backend-native fallbacks are shown next to the adapter-prefixed var. If you already have `AWS_*` set in your environment, `S3_*` reads them automatically — no duplication needed.

## Pick an adapter once

Every command below takes `--adapter <name>`. Or set `STORAGE_ADAPTER` once and skip the flag:

```sh
export STORAGE_ADAPTER=tigris
export TIGRIS_BUCKET=my-bucket
export TIGRIS_ACCESS_KEY_ID=…
export TIGRIS_SECRET_ACCESS_KEY=…
storage ls photos/
```

## Read commands

```sh
storage ls [prefix]              # list objects under a prefix
storage stat <path>              # metadata for one object
storage cat <path>               # stream bytes to stdout
storage sign download <path>     # signed GET URL (string)
storage sign upload <path>       # signed PUT/POST URL (JSON: method, url, fields?)
```

`ls`, `stat`, and `sign download` honor the TTY/JSON convention (aligned text in a terminal, JSON when piped, `--json` / `--no-json` to force). `cat` always streams raw bytes — pipe with `>` to save. `sign upload` always emits JSON because the result is structured (method + url + optional form fields for S3-style POST).

```sh
storage cat photos/cat.jpg > local.jpg
storage cat config.json | jq .
storage stat photos/cat.jpg
storage ls photos/ --limit 100 --cursor "$cursor"

storage sign download downloads/report.pdf --ttl 3600
url=$(storage sign download downloads/report.pdf)

storage sign upload uploads/incoming.jpg \
  --ttl 600 --content-type image/jpeg --max-size 5242880
# { "method": "PUT", "url": "..." }
# or
# { "method": "POST", "url": "...", "fields": { ... } }
```

`sign upload` accepts `--content-type`, `--max-size`, `--min-size`. Adapters that don't enforce these (e.g. fs) silently drop them.

`StorageError` becomes a stderr message formatted as `✗ <Code>: <message>` (or just `✗ <Code>` when the message is the same as the code) plus a per-code hint: `NotFound` (check the path), `Unauthorized` (check the env vars), `InvalidArgument` (check the command arguments), `Conflict`, `NotSupported`, `Provider` (the backend rejected the operation).

## Write commands

```sh
storage cp <src> <dst>       # copy between local and remote (storage://); `-` is stdin/stdout
storage mv <src> <dst>       # same scheme detection as cp; source removed after copy
storage rm <path>            # delete one remote object (bare keys or storage://<key>)
```

`cp` and `mv` use a `storage://` URL scheme to mark remote paths; anything else is local. At least one side must be remote — local-to-local is rejected (use the shell). `cp` also accepts `-` for stdin (as source) or stdout (as destination); `mv` does not. Same remote source and destination is rejected on both `cp` and `mv` (would destroy the object on `mv`):

```sh
storage cp ./report.pdf storage://reports/2026-06.pdf       # upload
storage cp storage://reports/2026-06.pdf ./report.pdf       # download
storage cp storage://a.jpg storage://b.jpg                   # remote → remote
storage cp - storage://from-stdin.txt < ./local.txt          # upload from stdin
storage cp storage://config.json - | jq .                    # download to stdout

storage mv storage://drafts/post.md storage://posts/post.md  # rename
storage rm storage://photos/cat.jpg
```

Write commands take `--fork <name>` to scope writes into a fork. `--snapshot <id>` is rejected with a clear message — snapshots are read-only. `cp` / `mv` accept `--content-type <mime>` to override the upload's Content-Type.

In human mode, write commands print a confirmation line to **stderr** (so stdout stays clean for piped data); JSON mode emits `{ action, from?, to?, path? }` on stdout.

## Snapshots and forks

List with `storage snapshots` and `storage forks`; manage with the singular `storage snapshot` and `storage fork` subcommand groups:

```sh
storage snapshots                                       # list snapshot ids
storage forks                                           # list fork names

storage snapshot create                                 # take a snapshot
storage snapshot create --name pre-deploy               # attach a label
storage snapshot rm snap-0193abc1234567890              # delete (idempotent)

storage fork create experiment-a                                          # seeded from base
storage fork create experiment-a --from-snapshot snap-0193abc1234         # seeded from a snapshot
storage fork rm experiment-a                                              # delete (idempotent)
```

Scope any object command into a snapshot or fork with `--snapshot <id>` / `--fork <name>`. `--snapshot` is reads only (rejected on writes); `--fork` works on both:

```sh
storage ls photos/ --snapshot snap-0193abc1234567890abcdef
storage cat photos/cat.jpg --fork experiment-a > local.jpg
storage cp ./image.jpg storage://image.jpg --fork experiment-a
storage sign downloads/report.pdf --snapshot snap-0193abc1234567890abcdef
```

Both flags compose on reads. Fork is applied first, so `--fork X --snapshot Y` addresses a snapshot inside the fork:

```sh
storage ls --fork experiment-a --snapshot snap-0193abc1234567890abcdef
```

## Output format

TTY-aware by default — human-readable when stdout is a terminal, JSON when piped:

```sh
storage ls photos/             # human (in a terminal)
storage ls photos/ | jq        # JSON (piped to jq)
storage ls photos/ --json      # force JSON
storage ls photos/ --no-json   # force human
```

For writes (`cp`, `mv`, `rm`), the human-mode confirmation line goes to **stderr** so stdout stays clean for downloaded bytes (`storage cp storage://config.json -`). JSON mode always emits structured output on stdout. Errors go to stderr in both modes.

## License

[Apache 2.0](./LICENSE).
