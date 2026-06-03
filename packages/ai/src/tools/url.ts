import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { readOnlyStorageAt, snapshotAndFork } from './shared.js';

const schema = z.object({
  path: z.string().describe('The file path to sign a URL for.'),
  expiresIn: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('URL TTL in seconds. Defaults to the tools-options default.'),
  ...snapshotAndFork,
});

export const url: ToolDef = {
  name: 'url',
  description:
    'Get a presigned download URL for a file. Hand this URL to another tool (image-understanding, OCR, etc.) when the agent itself does not need to read the bytes.',
  access: 'read',
  inputSchema: schema,
  async execute(
    input: z.infer<typeof schema>,
    ctx
  ): Promise<{ url: string; expiresIn: number }> {
    checkScope(ctx.options.scope, input.path);
    const handle = readOnlyStorageAt(ctx.storage, input);
    const expiresIn = input.expiresIn ?? ctx.options.urlExpiresIn;
    const signed = await handle.url(input.path, {
      expiresIn,
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
    return { url: signed, expiresIn };
  },
};
