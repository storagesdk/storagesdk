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
storage ls [prefix]          # list objects under a prefix
storage stat <path>          # metadata for one object
storage cat <path>           # stream bytes to stdout
storage sign <path>          # generate a signed URL
```

`ls`, `stat`, and `sign` honor the TTY/JSON convention (aligned text in a terminal, JSON when piped, `--json` / `--no-json` to force). `cat` always streams raw bytes — pipe with `>` to save:

```sh
storage cat photos/cat.jpg > local.jpg
storage cat config.json | jq .
storage stat photos/cat.jpg
storage ls photos/ --limit 100 --cursor "$cursor"
storage sign downloads/report.pdf --ttl 3600
```

`StorageError` becomes a clean stderr message + a per-code hint and exit 1: `NotFound` (check the path), `Unauthorized` (check the env vars), `InvalidArgument` (check the command arguments), `Conflict`, `NotSupported`.

## Snapshots and forks

List them with `storage snapshots` and `storage forks` (TTY/JSON output, same rule as the rest):

```sh
storage snapshots
# snap-0193abc1234567890abcdef
# snap-0193def0123456789abcdef

storage forks
# experiment-a
# experiment-b
```

Scope a read into a snapshot or fork with `--snapshot <id>` / `--fork <name>` on `ls`, `stat`, `cat`, or `sign`:

```sh
storage ls photos/ --snapshot snap-0193abc1234567890abcdef
storage cat photos/cat.jpg --fork experiment-a > local.jpg
storage sign downloads/report.pdf --snapshot snap-0193abc1234567890abcdef
```

Both flags compose. Fork is applied first, so `--fork X --snapshot Y` addresses a snapshot inside the fork:

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

Errors go to stderr; piped consumers get clean JSON on stdout.

## License

[Apache 2.0](./LICENSE).
