---
'@storagesdk/ai': minor
---

New package: `@storagesdk/ai` ships AI tool definitions for storagesdk. Hand a `Storage` instance to your agent runtime; get back a roster of `upload`, `download`, `head`, `list`, `url`, `delete`, `copy`, `move`, `upload_url`, plus the full snapshot and fork roster.

Vercel AI SDK integration:

```ts
import { tools } from '@storagesdk/ai/vercel';
import { storage } from './storage';

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: tools(storage),
  prompt: 'Snapshot the README, then add a section about the new module.',
});
```

## The 18 tools

Snake_case names for model familiarity:

- **Read**: `download`, `download_range`, `head`, `list`, `url`
- **Write**: `upload`, `delete`, `copy`, `move`, `upload_url`
- **Snapshots**: `snapshot_create`, `snapshot_list`, `snapshot_head`, `snapshot_delete`
- **Forks**: `fork_create`, `fork_list`, `fork_head`, `fork_delete`

Read and write tools take an optional `snapshot` / `fork` param so the model can address content in a snapshot or fork without doubling the tool count.

## Design calls baked in

- **Snapshot/fork is the narrative.** Tool descriptions teach the model "snapshot before risky edits, fork to try variants." That's the reason to exist vs every other file-access tool pack.
- **Download body handling.** Text under 256 KB returns inline; otherwise a short-lived presigned URL. Avoids returning multi-MB base64 to the model.
- **Scope is strict-validate.** Agent sees full prefixed paths and gets `InvalidArgument` for anything outside the prefix. Simpler than auto-prepend, easier to ship correctly.
- **`upload` only takes text.** Binary uploads route through `upload_url` (presigned PUT). Agents rarely produce binary themselves.

## Options

One `ToolsOptions` type, all fields required when resolved. Callers pass `Partial<ToolsOptions>`; the factory fills defaults:

- `readOnly: true` — strips mutators only; reads survive (including `snapshot_list`, `snapshot_head`, `fork_list`, `fork_head`)
- `scope: 'agents/'` — every path strict-validated under that prefix
- `maxInlineBytes` — cap on inline text from `download` (default 256 KB)
- `urlExpiresIn` — presigned URL TTL (default 600 s)
- `signal` — `AbortSignal` plumbed through every storage operation (the one field that stays optional even when resolved — absence is its meaningful default)

## Package layout

```
packages/ai/
├── src/
│   ├── index.ts            # public re-exports
│   ├── types.ts            # ToolsOptions, ToolDef, ToolContext, ToolScope
│   ├── scope.ts            # normalizeScope + checkScope
│   ├── download.ts         # downloadDecide + DownloadResult
│   ├── tools/
│   │   ├── index.ts        # ALL_TOOLS + selectTools registry
│   │   ├── shared.ts       # snapshotAndFork shape, readOnlyStorageAt / storageAt
│   │   ├── download.ts     # one file per tool
│   │   ├── download-range.ts
│   │   ├── head.ts
│   │   ├── list.ts
│   │   ├── url.ts
│   │   ├── upload.ts
│   │   ├── delete.ts
│   │   ├── copy.ts
│   │   ├── move.ts
│   │   ├── upload-url.ts
│   │   ├── snapshot-create.ts
│   │   ├── snapshot-list.ts
│   │   ├── snapshot-head.ts
│   │   ├── snapshot-delete.ts
│   │   ├── fork-create.ts
│   │   ├── fork-list.ts
│   │   ├── fork-head.ts
│   │   └── fork-delete.ts
│   └── vercel/
│       ├── index.ts        # tools(storage, opts) factory
│       └── adapt.ts        # ToolDef → Vercel SDK Tool via dynamicTool
└── test/tools.test.ts      # 15 e2e tests against fs adapter
```

### `types.ts`

One canonical `ToolsOptions` interface with all behavior fields required (resolved form). Plus `ToolDef`, `ToolContext`, `ToolScope`.

### `scope.ts`

`normalizeScope()` canonicalizes scope strings (`'agents'`, `'/agents/'` → `'agents/'`). `checkScope(scope, path)` throws `StorageError({ code: 'InvalidArgument' })` on out-of-scope paths. Co-located because both handle the same boundary concern.

### `tools/`

One file per tool, ~20–40 lines each. Every file follows the same shape: a local `schema = z.object({...})` const, an exported `ToolDef` whose `execute` accepts `z.infer<typeof schema>` for full type-safety. Handlers return the underlying `@storagesdk/core` types directly (`StorageItemMeta`, `ListResult`, `SnapshotInfo`, `ForkInfo`, `UploadUrlResult`) — Vercel's JSON serialization stringifies `Date` fields for the model, no manual conversion layer. `shared.ts` holds the two cross-tool helpers: the `snapshotAndFork` schema fragment for reads, plus `readOnlyStorageAt(storage, address)` → `ReadOnlyStorage` and `storageAt(storage, address)` → `Storage` for walking into a fork and/or snapshot.

`tools/index.ts` is just the registry — imports all 18, exports `ALL_TOOLS` and `selectTools(options)` (filters by `readOnly`).

### `vercel/index.ts`

The factory: merges `Partial<ToolsOptions>` with defaults into a fully-resolved `ToolsOptions`, then converts every selected `ToolDef` into a Vercel SDK `Tool` via `dynamicTool`.

## Example

`examples/agent-with-snapshots/index.ts` builds a `Storage` via the shared `getAdapter()` helper (defaults to fs, swap with `EXAMPLE_ADAPTER`), creates a fork as a sandbox, seeds it with a tiny codebase, then asks Claude to add a `logMultiply` helper modeled on `logAdd` — snapshotting first. Cleanup is a single `forks.delete`. Runs the agent live with `ANTHROPIC_API_KEY`; prints the tool roster and exits otherwise.
