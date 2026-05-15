# @storagesdk/adapters

Backend adapters for [storagesdk](https://github.com/tigrisdata/storagesdk). Import the adapter you need via a subpath; the rest are tree-shaken out.

## Available adapters

- `@storagesdk/adapters/fs` — filesystem adapter. Targets `node:fs/promises`; primarily for local development and tests.

> Status: pre-release. See `docs/RFC.md` and `docs/PLAN.md` at the repo root.
