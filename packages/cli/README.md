# @storagesdk/cli

Command-line interface for [storagesdk](https://github.com/storagesdk/storagesdk). Ships two binary aliases — `storage` (primary) and `storagesdk` (for searchability) — both pointing at the same script.

```sh
npm install -g @storagesdk/cli
storage adapters
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

## Output format

TTY-aware by default — human-readable when stdout is a terminal, JSON when piped:

```sh
storage adapters             # human (in a terminal)
storage adapters | jq        # JSON (piped to jq)
storage adapters --json      # force JSON
storage adapters --no-json   # force human
```

Errors go to stderr; piped consumers get clean JSON on stdout.

## License

[Apache 2.0](./LICENSE).
