import type { StorageItemMeta } from '@storagesdk/core';
import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  path: z.string().describe('The destination file path.'),
  body: z
    .string()
    .describe('The text content to write. Will be UTF-8 encoded.'),
  contentType: z
    .string()
    .optional()
    .describe(
      'Content type to record (e.g. "text/markdown"). Defaults to "text/plain; charset=utf-8".'
    ),
  fork: z
    .string()
    .optional()
    .describe(
      'Target a fork by name. Omit to write to the parent (live) storage.'
    ),
});

export const upload: ToolDef = {
  name: 'upload',
  description:
    'Write a text file to storage. Use for code, configuration, JSON, Markdown, etc. For binary content, call `upload_url` to get a presigned PUT URL and have the user (or another tool) upload directly.',
  access: 'write',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<StorageItemMeta> {
    checkScope(ctx.options.scope, input.path);
    const handle = storageAt(ctx.storage, input);
    return handle.upload(input.path, input.body, {
      contentType: input.contentType ?? 'text/plain; charset=utf-8',
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
