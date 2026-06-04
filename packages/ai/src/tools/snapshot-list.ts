import type { SnapshotInfo } from '@storagesdk/core';
import { z } from 'zod';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  fork: z
    .string()
    .optional()
    .describe(
      'List snapshots of a fork by name. Omit to list parent (live) snapshots.'
    ),
});

export const snapshotList: ToolDef = {
  name: 'snapshot_list',
  description:
    'List all snapshots, oldest to newest, on the current storage (or a fork).',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<SnapshotInfo[]> {
    const handle = storageAt(ctx.storage, input);
    return handle.snapshots.list();
  },
};
