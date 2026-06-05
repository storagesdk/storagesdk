import { createTool } from '@mastra/core/tools';
import type { ToolContext, ToolDef } from '../types.js';

/**
 * Convert one `ToolDef` into a Mastra tool. The `id` is the storagesdk
 * verb name; `inputSchema` is the Zod schema directly (Mastra accepts
 * Zod natively); `execute` closes over the shared `ctx` so the same
 * storage instance is used for every call.
 */
export function adaptToMastra(def: ToolDef, ctx: ToolContext) {
  return createTool({
    id: def.name,
    description: def.description,
    inputSchema: def.inputSchema,
    execute: async (input: unknown) => def.execute(input, ctx),
  });
}
