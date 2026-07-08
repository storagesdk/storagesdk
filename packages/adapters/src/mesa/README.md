# @storagesdk/adapters/mesa

[Mesa](https://mesa.dev/) adapter for storagesdk.

```sh
npm install @storagesdk/core @storagesdk/adapters @mesadev/sdk
```

```ts
import { Storage } from '@storagesdk/core';
import { mesa } from '@storagesdk/adapters/mesa';

const storage = new Storage({
  adapter: mesa({
    repo: 'agent-runs',
    apiKey: process.env.MESA_API_KEY,
    org: 'acme',
  }),
});
```

## Configuration

```ts
mesa({
  repo: string;
  apiKey?: string;
  org?: string;
  bookmark?: string;
  apiUrl?: string;
  vcsUrl?: string;
  userAgent?: string;
  author?: { name: string; email: string };
  committer?: { name: string; email: string };
  commitMessage?: (op, paths) => string;
})
```

## Notes

- Object reads use `mesa.content.get()`.
- Writes create Mesa changes and advance the configured bookmark.
- Snapshots are Mesa bookmarks under `storagesdk/snapshots/<bookmark>/<id>`.
- Forks are Mesa bookmarks in the same repository. Mesa bookmarks do not persist fork provenance, so `forks.list()` and `forks.head()` omit `fromSnapshot`.
- `url()` returns a deterministic `mesa://` locator, not a fetchable signed HTTP URL.
- `uploadUrl()` throws `NotSupported`; Mesa does not expose object-style presigned upload URLs.

## Environment

```sh
MESA_REPO=agent-runs
MESA_API_KEY=mesa_...
MESA_ORG=acme
MESA_BOOKMARK=main
MESA_API_URL=https://api.mesa.dev/v1
MESA_VCS_URL=https://vcs.mesa.dev
MESA_AUTHOR_NAME=Storage Bot
MESA_AUTHOR_EMAIL=storage@example.com
```
