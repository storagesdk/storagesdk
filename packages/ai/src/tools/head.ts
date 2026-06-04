import type { StorageItemMeta } from '@storagesdk/core';
import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { readOnlyStorageAt, snapshotAndFork } from './shared.js';

const schema = z.object({
  path: z.string().describe('The file path to inspect.'),
  ...snapshotAndFork,
});

export const head: ToolDef = {
  name: 'head',
  description:
    'Get metadata about a file (size, content type, etag, last-modified) without downloading its contents. Cheap probe to check whether a file exists or has changed.',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<StorageItemMeta> {
    checkScope(ctx.options.scope, input.path);
    const handle = readOnlyStorageAt(ctx.storage, input);
    return handle.head(
      input.path,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
  },
};
