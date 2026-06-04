import type { ListResult } from '@storagesdk/core';
import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { readOnlyStorageAt, snapshotAndFork } from './shared.js';

const schema = z.object({
  prefix: z
    .string()
    .optional()
    .describe('Only list files whose path starts with this prefix.'),
  cursor: z
    .string()
    .optional()
    .describe('Pagination cursor from a previous `list` call.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Maximum items to return (default: backend-decided).'),
  delimiter: z
    .string()
    .optional()
    .describe(
      'Group results by this delimiter to navigate hierarchically (e.g. "/").'
    ),
  ...snapshotAndFork,
});

export const list: ToolDef = {
  name: 'list',
  description:
    'List files in storage, optionally filtered by prefix. Returns metadata for each item plus a `cursor` to fetch the next page. Pass the cursor back on the next call to paginate.',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<ListResult> {
    let prefix = input.prefix;
    if (prefix) {
      checkScope(ctx.options.scope, prefix);
    } else if (ctx.options.scope && !input.cursor) {
      // First page with no prefix in scoped mode — anchor at the
      // scope. On subsequent pages the cursor already carries the
      // original prefix context; overriding it here would change the
      // listing frame and break pagination semantics.
      prefix = ctx.options.scope;
    }
    const handle = readOnlyStorageAt(ctx.storage, input);
    return handle.list({
      ...(prefix ? { prefix } : {}),
      ...(input.cursor ? { cursor: input.cursor } : {}),
      ...(input.limit !== undefined ? { limit: input.limit } : {}),
      ...(input.delimiter ? { delimiter: input.delimiter } : {}),
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
