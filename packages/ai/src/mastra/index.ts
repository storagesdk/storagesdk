import type { Storage } from '@storagesdk/core';
import { normalizeScope } from '../scope.js';
import { selectTools } from '../tools/index.js';
import type { ToolContext, ToolsOptions } from '../types.js';
import { adaptToMastra } from './adapt.js';

const DEFAULT_MAX_INLINE_BYTES = 256 * 1024;
const DEFAULT_URL_EXPIRES_IN = 600;

/**
 * Build a Mastra tool record from a `Storage` instance. Pass the
 * result directly to `Agent`'s `tools` field:
 *
 * ```ts
 * import { Agent } from '@mastra/core/agent';
 * import { tools } from '@storagesdk/ai/mastra';
 * import { storage } from './storage';
 *
 * const agent = new Agent({
 *   name: 'codeReviewer',
 *   instructions: 'Snapshot before risky edits…',
 *   model: 'anthropic/claude-sonnet-4-5',
 *   tools: tools(storage),
 * });
 * ```
 */
export function tools(storage: Storage, opts?: Partial<ToolsOptions>) {
  const options: ToolsOptions = {
    readOnly: opts?.readOnly ?? false,
    scope: normalizeScope(opts?.scope),
    maxInlineBytes: opts?.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
    urlExpiresIn: opts?.urlExpiresIn ?? DEFAULT_URL_EXPIRES_IN,
    ...(opts?.signal ? { signal: opts.signal } : {}),
  };
  const ctx: ToolContext = { storage, options };
  const out: Record<string, ReturnType<typeof adaptToMastra>> = {};
  for (const def of selectTools(options)) {
    out[def.name] = adaptToMastra(def, ctx);
  }
  return out;
}

export type { ToolsOptions } from '../types.js';
