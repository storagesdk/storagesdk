import { z } from 'zod';
import { type DownloadResult, downloadDecide } from '../download.js';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { readOnlyStorageAt, snapshotAndFork } from './shared.js';

const schema = z.object({
  path: z.string().describe('The file path to read.'),
  ...snapshotAndFork,
});

export const download: ToolDef = {
  name: 'download',
  description:
    'Read the contents of a file from storage. Small text files are returned inline; larger or binary files come back as a short-lived presigned URL the caller can fetch. Use `snapshot` to read from a specific snapshot, or `fork` to read from a fork.',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<DownloadResult> {
    checkScope(ctx.options.scope, input.path);
    const handle = readOnlyStorageAt(ctx.storage, input);
    return downloadDecide(handle, input.path, {
      maxInlineBytes: ctx.options.maxInlineBytes,
      urlExpiresIn: ctx.options.urlExpiresIn,
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
