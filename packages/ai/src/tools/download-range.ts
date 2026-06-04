import { z } from 'zod';
import { type DownloadResult, downloadDecide } from '../download.js';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { readOnlyStorageAt, snapshotAndFork } from './shared.js';

const schema = z.object({
  path: z.string().describe('The file path to read.'),
  offset: z.number().int().min(0).describe('First byte to read (0-based).'),
  length: z.number().int().min(1).describe('Number of bytes to read.'),
  ...snapshotAndFork,
});

export const downloadRange: ToolDef = {
  name: 'download_range',
  description:
    'Read a specific byte range of a file. Useful for paginated reads of large text files, or for sampling a region of a binary blob. Pair with `head` first to discover the file size. If the result comes back as `kind: "url"` (binary or larger than the inline cap), the original `offset` and `length` are echoed in `range` — fetch the URL with `Range: bytes=<offset>-<offset+length-1>` to honor the slice.',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<DownloadResult> {
    checkScope(ctx.options.scope, input.path);
    const handle = readOnlyStorageAt(ctx.storage, input);
    return downloadDecide(handle, input.path, {
      maxInlineBytes: ctx.options.maxInlineBytes,
      urlExpiresIn: ctx.options.urlExpiresIn,
      range: { offset: input.offset, length: input.length },
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
