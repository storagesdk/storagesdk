# @storagesdk/adapters/freestyle

Adapter for a [Freestyle Git](https://www.freestyle.sh/docs/git) repository. Object operations go through Freestyle's repository contents API; snapshots and forks are git branches.

```sh
npm install @storagesdk/core @storagesdk/adapters freestyle
```

```ts
import { Storage } from '@storagesdk/core';
import { freestyle } from '@storagesdk/adapters/freestyle';

const storage = new Storage({
  adapter: freestyle({
    repoId: process.env.FREESTYLE_REPO_ID,
    // branch defaults to the repo's default branch
    // apiKey defaults to the Freestyle SDK's env handling
  }),
});

await storage.upload('reports/2026-05.md', body, { contentType: 'text/markdown' });
const item = await storage.download('reports/2026-05.md');
const url  = await storage.url('reports/2026-05.md');
```

## How the storagesdk model maps to git

- `bucket` doesn't exist on Freestyle Git — the storage namespace is `(repoId, branch)`. The adapter takes those directly.
- `snapshots` are branches under `storagesdk/snapshots/<branch>/<id>`. The snapshot id is the final path segment.
- `forks` are branches at the user-provided branch name, optionally seeded from a snapshot branch (`fromSnapshot`) instead of the live branch's HEAD.

```ts
const snap = await storage.snapshots.create({ name: 'pre-migration' });
snap.id; // 'pre-migration'

await storage.forks.create({ name: 'experiment-42', fromSnapshot: snap.id });
const fork = storage.forks.get('experiment-42'); // Storage scoped to that branch
await fork.upload('config.json', JSON.stringify({ flag: true }));
```

`forks.create` without `fromSnapshot` branches from the live branch's HEAD.

## Config

```ts
interface FreestyleConfig {
  repoId: string;
  apiKey?: string;       // falls back to Freestyle SDK env handling
  accessToken?: string;  // mutually exclusive with apiKey
  branch?: string;       // default branch, fetched lazily on first call
  baseUrl?: string;
  author?: { name: string; email: string };
  commitMessage?: (op: 'upload' | 'delete' | 'copy' | 'move', paths: string[]) => string;
}
```

- `repoId` — Freestyle Git repository id.
- `apiKey` / `accessToken` — pass exactly one when you don't want the Freestyle SDK to read its default environment.
- `author` — commit author used for write operations. Defaults to `storagesdk <storagesdk@example.invalid>`.
- `commitMessage` — every write op (upload/delete/copy/move) creates a commit. Defaults to `"storagesdk: <op> <path>"`. Provide a function to customize.

## Environment

For runtime adapter selection, `buildAdapter('freestyle')` reads:

| Env var | Required | Notes |
| --- | --- | --- |
| `FREESTYLE_REPO_ID` | Yes | Freestyle Git repository id. |
| `FREESTYLE_API_KEY` | No | Mutually exclusive with `FREESTYLE_ACCESS_TOKEN`. |
| `FREESTYLE_ACCESS_TOKEN` | No | Scoped Freestyle access token. |
| `FREESTYLE_BRANCH` | No | Working branch. Defaults to the repo default branch. |
| `FREESTYLE_BASE_URL` | No | Override Freestyle API base URL. |
| `FREESTYLE_AUTHOR_NAME` | No | Used with `FREESTYLE_AUTHOR_EMAIL` for commits. |
| `FREESTYLE_AUTHOR_EMAIL` | No | Used with `FREESTYLE_AUTHOR_NAME` for commits. |

## What this adapter doesn't preserve

- **`uploadUrl`** — Freestyle Git does not expose object-style presigned upload URLs. Throws `NotSupported`.
- **User metadata** — git tracks file content + path, not arbitrary metadata. `upload({ metadata })` is silently dropped.
- **`contentType`** — Freestyle Git doesn't store a Content-Type; `download` returns `application/octet-stream` regardless.
- **`lastModified` in `list`** — repository tree listings don't include per-file commit dates; list results return `lastModified: new Date(0)`.

## Current SDK limits

- **Snapshot and fork deletion** — the Freestyle SDK does not currently expose branch deletion, so `snapshots.delete()` and `forks.delete()` throw `NotSupported`.
- **Snapshot timestamps** — branch listings do not include creation timestamps, so `snapshots.list()` returns `createdAt: new Date(0)` for existing snapshot branches. Newly created snapshots return the local creation time.
- **Fork provenance** — Freestyle branch listings do not expose the source branch, so `forks.list()` and `forks.head()` return fork names without `fromSnapshot`.

## Escape hatch

`storage.raw` is the underlying `Freestyle` instance.

```ts
import type { Freestyle } from 'freestyle';

const storage = new Storage({ adapter: freestyle({ repoId }) });
//    ^^^^^^^^ — Storage<Freestyle>, inferred.

const repo = storage.raw.git.repos.ref({ repoId });
const branches = await repo.branches.list();
```
