import { dynamicTool, type Tool } from 'ai';
import type { ToolContext, ToolDef } from '../types.js';

/**
 * Convert one `ToolDef` into a Vercel AI SDK `Tool`. `dynamicTool`
 * matches the registry's heterogeneous semantic: input and output are
 * unknown at the boundary, validated against the schema at call time.
 */
export function adaptToVercel(def: ToolDef, ctx: ToolContext): Tool {
  return dynamicTool({
    description: def.description,
    inputSchema: def.inputSchema,
    execute: async (input) => def.execute(input, ctx),
  });
}
