# @storagesdk/ai

AI tool definitions for [storagesdk](https://github.com/storagesdk/storagesdk). Hand a `Storage` instance to your agent runtime; get back a ready-to-register roster of upload, download, snapshot, and fork tools.

```sh
npm install @storagesdk/core @storagesdk/adapters @storagesdk/ai
```

The package ships per-framework subpath integrations. Pick the one for your agent runtime, hand it a `Storage`, and pass the result to your runtime's tool registration site.

## The 18 tools

Snake_case names for model familiarity. Read and write tools take an optional `snapshot` / `fork` param so the model can address content in a snapshot or fork without doubling the tool count.

| Group | Tools |
| --- | --- |
| Read | `download`, `download_range`, `head`, `list`, `url` |
| Write | `upload`, `delete`, `copy`, `move`, `upload_url` |
| Snapshots | `snapshot_create`, `snapshot_list`, `snapshot_head`, `snapshot_delete` |
| Forks | `fork_create`, `fork_list`, `fork_head`, `fork_delete` |

## Design

- **Snapshot and fork are the narrative.** Tool descriptions teach the model to call `snapshot_create` before risky edits and `fork_create` to try variants. That's the reason to exist vs. every other "give the agent file access" tool pack.
- **Download body handling.** Text under 256 KB is returned inline; otherwise a short-lived presigned URL the agent can hand to another tool (image-understanding, OCR, etc.). Avoids returning multi-MB base64 to the model. `download_range`'s URL fallback echoes the requested `range` so the agent fetches with `Range: bytes=<offset>-<offset+length-1>` to honor the slice.
- **Scope is strict-validated.** When `scope: 'agents/'` is set, every path argument is checked against the prefix. Out-of-scope paths throw `StorageError({ code: 'InvalidArgument' })`. The model sees full prefixed paths.
- **`upload` only takes text.** Binary uploads route through `upload_url` (presigned PUT) — agents rarely produce binary directly.

## Snapshots and forks in tools

Read tools (`download`, `download_range`, `head`, `list`, `url`) accept optional `snapshot` and `fork` fields. Both, either, or neither — the tool walks `forks.get(fork).snapshots.get(snapshot)` as needed:

```ts
// Read from the live state of the parent
await download({ path: 'utils.ts' });

// Read from a snapshot
await download({ path: 'utils.ts', snapshot: 'snap-…' });

// Read from a fork
await download({ path: 'utils.ts', fork: 'experiment' });

// Read from a snapshot of a fork
await download({ path: 'utils.ts', fork: 'experiment', snapshot: 'snap-…' });
```

Write, snapshot, and fork tools accept only `fork` — snapshots are immutable, so there's no equivalent navigation.

## Options

```ts
interface ToolsOptions {
  readOnly: boolean;        // strip mutators only; reads survive (default false)
  scope: string;            // path-prefix guard, strict-validated (default '')
  maxInlineBytes: number;   // cap on inline text in download (default 256 KB)
  urlExpiresIn: number;     // TTL for presigned URLs in seconds (default 600)
  signal?: AbortSignal;     // plumbed through every storage operation
}
```

Callers pass `Partial<ToolsOptions>`; the factory fills defaults so handlers always read populated values.

```ts
tools(storage, { readOnly: true, scope: 'agents/' });
```

Under `readOnly`: every read tool survives — including the non-mutating snapshot/fork tools (`snapshot_list`, `snapshot_head`, `fork_list`, `fork_head`). Stripped: `upload`, `delete`, `copy`, `move`, `upload_url`, `snapshot_create`, `snapshot_delete`, `fork_create`, `fork_delete`.

## Vercel AI SDK

```sh
npm install ai @ai-sdk/anthropic
```

```ts
import { anthropic } from '@ai-sdk/anthropic';
import { tigris } from '@storagesdk/adapters/tigris';
import { tools } from '@storagesdk/ai/vercel';
import { Storage } from '@storagesdk/core';
import { generateText } from 'ai';

const storage = new Storage({
  adapter: tigris({
    bucket: 'agent-runs',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  }),
});

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: tools(storage),
  prompt:
    'Snapshot the repo, then add a section about the new module to README.md.',
});
```

`tools(storage)` returns a `Record<string, Tool>` ready to pass to `generateText` / `streamText`.

## Example

[`examples/agent-with-snapshots`](../../examples/agent-with-snapshots) walks an Anthropic-backed Vercel AI SDK agent through editing a tiny "codebase" with snapshot-before-edit. Defaults to the filesystem adapter; swap with `EXAMPLE_ADAPTER`.

## License

[Apache 2.0](./LICENSE).
