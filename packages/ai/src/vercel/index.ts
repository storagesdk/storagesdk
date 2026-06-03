import type { Storage } from '@storagesdk/core';
import type { Tool } from 'ai';
import { normalizeScope } from '../scope.js';
import { selectTools } from '../tools/index.js';
import type { ToolContext, ToolsOptions } from '../types.js';
import { adaptToVercel } from './adapt.js';

const DEFAULT_MAX_INLINE_BYTES = 256 * 1024;
const DEFAULT_URL_EXPIRES_IN = 600;

/**
 * Build a Vercel AI SDK tool record from a `Storage` instance. Pass the
 * result directly to `streamText` / `generateText` as `tools`:
 *
 * ```ts
 * import { tools } from '@storagesdk/ai/vercel';
 * import { storage } from './storage';
 *
 * const result = await generateText({
 *   model: anthropic('claude-sonnet-4-5'),
 *   tools: tools(storage),
 *   prompt: 'Summarize the README at the root.',
 * });
 * ```
 */
export function tools(
  storage: Storage,
  opts?: Partial<ToolsOptions>
): Record<string, Tool> {
  const options: ToolsOptions = {
    readOnly: opts?.readOnly ?? false,
    scope: normalizeScope(opts?.scope),
    maxInlineBytes: opts?.maxInlineBytes ?? DEFAULT_MAX_INLINE_BYTES,
    urlExpiresIn: opts?.urlExpiresIn ?? DEFAULT_URL_EXPIRES_IN,
    ...(opts?.signal ? { signal: opts.signal } : {}),
  };
  const ctx: ToolContext = { storage, options };
  const out: Record<string, Tool> = {};
  for (const def of selectTools(options)) {
    out[def.name] = adaptToVercel(def, ctx);
  }
  return out;
}

export type { ToolsOptions } from '../types.js';
