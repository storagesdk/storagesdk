---
"@storagesdk/adapters": minor
"@storagesdk/core": patch
---

New `@storagesdk/adapters/github` adapter for [GitHub](https://github.com) repositories. Object operations go through the Contents API; snapshots and forks are first-class git refs — every snapshot is a tag, every fork is a branch.

```ts
import { github } from '@storagesdk/adapters/github';

const storage = new Storage({
  adapter: github({
    owner: 'storagesdk',
    repo: 'agent-artifacts',
    // branch defaults to the repo's default branch
    // token defaults to process.env.GITHUB_TOKEN
  }),
});

// Snapshot = tag. Tag name is the snapshot id.
const snap = await storage.snapshots.create({ name: 'pre-migration' });

// Fork = branch, optionally seeded from a tag.
await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });
const fork = storage.forks.get('experiment');
await fork.upload('config.json', JSON.stringify({ flag: true }));
```

`storage.raw` is the underlying `Octokit` instance — reach for it when you need an API the adapter doesn't surface.

**v1 limits:**

- Files ≤ 1 MB only (Contents API cap). Larger files throw `InvalidArgument`; native large-file support via the Git Data API is on the roadmap.
- `uploadUrl()` throws `NotSupported` (GitHub has no presigned upload URLs).
- User metadata and `contentType` are dropped — git tracks file content + path, not arbitrary metadata.
- Every write op creates a commit; default message is `"storagesdk: <op> <path>"`, overridable via the `commitMessage` config field.

**`@storagesdk/core` patch:** re-export `DownloadOptions` from the public entry alongside the other options types.
