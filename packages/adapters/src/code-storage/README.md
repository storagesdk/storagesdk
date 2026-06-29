# @storagesdk/adapters/code-storage

[Code Storage](https://code.storage/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @pierre/storage
```

```ts
import { Storage } from '@storagesdk/core';
import { codeStorage } from '@storagesdk/adapters/code-storage';

const storage = new Storage({
  adapter: codeStorage({
    name: 'your-org',
    repo: 'agent-runs',
    key: process.env.CODE_STORAGE_KEY!,
  }),
});
```

## Configuration

```ts
codeStorage({
  name: string;              // Code Storage organization identifier
  repo: string;              // repository id
  branch?: string;           // defaults to the repo default branch
  key?: string;              // ES256 private key PEM; required unless token is set
  token?: string;            // pre-minted JWT
  apiBaseUrl?: string;
  storageBaseUrl?: string;
  defaultTTL?: number;
  author?: { name: string; email: string };
  committer?: { name: string; email: string };
  commitMessage?: (op, paths) => string;
})
```

## Environment

The runtime registry reads:

```sh
CODE_STORAGE_NAME=your-org
CODE_STORAGE_REPO=agent-runs
CODE_STORAGE_KEY='-----BEGIN PRIVATE KEY-----...'
CODE_STORAGE_TOKEN=...
CODE_STORAGE_BRANCH=main
CODE_STORAGE_API_BASE_URL=...
CODE_STORAGE_STORAGE_BASE_URL=...
CODE_STORAGE_DEFAULT_TTL=3600
CODE_STORAGE_AUTHOR_NAME=Storage Bot
CODE_STORAGE_AUTHOR_EMAIL=storage@example.com
```

Set either `CODE_STORAGE_KEY` or `CODE_STORAGE_TOKEN`.

## Code Storage Notes

- Object reads use Code Storage file APIs.
- Writes create Git commits through the Code Storage commit builder.
- Snapshots are lightweight tags under `storagesdk/<branch>/<id>`.
- Forks are branches in the same repository.
- `url()` and `uploadUrl()` throw `NotSupported`; Code Storage exposes authenticated Git remote URLs, not object-style signed file URLs.

## Escape Hatch

```ts
const storage = new Storage({ adapter: codeStorage({ /* ... */ }) });
//    inferred as Storage<GitStorage>

await storage.raw.listRepos();
```
