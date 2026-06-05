---
'@storagesdk/ai': minor
---

New subpath: `@storagesdk/ai/mastra` — adapts the storagesdk tool registry to [Mastra](https://mastra.ai/)'s `Agent`. Hand a `Storage` instance to `tools(storage)` and the result drops straight into an `Agent`'s `tools` field:

```ts
import { Agent } from '@mastra/core/agent';
import { tigris } from '@storagesdk/adapters/tigris';
import { tools } from '@storagesdk/ai/mastra';
import { Storage } from '@storagesdk/core';

const storage = new Storage({
  adapter: tigris({
    bucket: 'agent-runs',
    accessKeyId: process.env.TIGRIS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.TIGRIS_SECRET_ACCESS_KEY!,
  }),
});

const agent = new Agent({
  name: 'codeReviewer',
  instructions: 'Snapshot before any risky edit so the user can revert.',
  model: 'anthropic/claude-sonnet-4-5',
  tools: tools(storage),
});
```

The full 18-tool roster (`upload`, `download`, `head`, `list`, `url`, `delete`, `copy`, `move`, `upload_url`, plus the `snapshot_*` and `fork_*` namespaces) is built into Mastra `Tool` instances via `createTool` from `@mastra/core/tools`. Each tool's `id` matches the verb name; descriptions and Zod schemas are shared with the other framework adapters.

Same `ToolsOptions` (`readOnly`, `scope`, `maxInlineBytes`, `urlExpiresIn`, `signal`) as `@storagesdk/ai/vercel`. `@mastra/core` is an optional peer dep — install it alongside this package only if you're using the Mastra subpath.
