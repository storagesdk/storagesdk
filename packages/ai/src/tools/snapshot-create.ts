import type { SnapshotInfo } from '@storagesdk/core';
import { z } from 'zod';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  name: z
    .string()
    .optional()
    .describe('Optional human-readable label for the snapshot.'),
  fork: z
    .string()
    .optional()
    .describe(
      'Snapshot a fork by name. Omit to snapshot the parent (live) storage.'
    ),
});

export const snapshotCreate: ToolDef = {
  name: 'snapshot_create',
  description:
    'Capture a point-in-time snapshot of the current storage state. Returns a snapshot id that other tools can read from. Best practice: call this before any risky or irreversible operation so you can recover if it goes wrong.',
  access: 'write',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<SnapshotInfo> {
    const handle = storageAt(ctx.storage, input);
    return handle.snapshots.create({
      ...(input.name ? { name: input.name } : {}),
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
