# agent-with-snapshots

Demonstrates the snapshot-before-edit pattern with `@storagesdk/ai/vercel` and the Vercel AI SDK. The agent receives a fork sandbox seeded with a tiny "codebase", snapshots it, then adds a new helper.

## Run

```sh
pnpm install
ANTHROPIC_API_KEY=… pnpm --filter @storagesdk/examples agent-with-snapshots
```

Without `ANTHROPIC_API_KEY`, the script seeds the fork, prints the tool roster, and exits — useful for verifying the wiring without burning API calls.

Defaults to the filesystem adapter; swap with `EXAMPLE_ADAPTER` and the matching `EXAMPLE_*` env vars from the [top-level examples README](../README.md#picking-an-adapter).

## What the script does

1. **`new Storage({ adapter: getAdapter() })`** — build storage against the selected backend.
2. **`storage.forks.create({ name: 'storagesdk-agent-demo-<suffix>' })`** — spin up a sandbox so the parent storage stays untouched. Cleanup at the end is a single `forks.delete`.
3. **Seed `utils.ts` and `README.md`** into the sandbox.
4. **`tools(sandbox)`** — build the Vercel AI SDK tool registry pointed at the fork.
5. **`generateText({ model: anthropic(…), tools, prompt: …, stopWhen: stepCountIs(12) })`** — run the agent. System prompt directs it to snapshot before editing.
6. Print the agent's response, the snapshots it created, and the final `utils.ts`.
7. **`storage.forks.delete(forkName)`** — drop the fork (and every snapshot inside it) in one call.

## Key insight

Snapshot is the agent's undo button. Telling the model in the system prompt to call `snapshot_create` before any irreversible operation gives you a recoverable state at every step — and the snapshot ids are visible in the tool-call trace, so you can hand them back to `download` with `snapshot: <id>` to see exactly what the file looked like at any point.
