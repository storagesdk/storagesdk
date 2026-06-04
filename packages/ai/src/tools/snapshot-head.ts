import type { SnapshotInfo } from '@storagesdk/core';
import { z } from 'zod';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  id: z.string().describe('The snapshot id.'),
  fork: z
    .string()
    .optional()
    .describe(
      'Look up a snapshot on a fork by name. Omit for the parent (live) storage.'
    ),
});

export const snapshotHead: ToolDef = {
  name: 'snapshot_head',
  description: 'Get metadata for a single snapshot by id.',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<SnapshotInfo> {
    const handle = storageAt(ctx.storage, input);
    return handle.snapshots.head(
      input.id,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
  },
};
