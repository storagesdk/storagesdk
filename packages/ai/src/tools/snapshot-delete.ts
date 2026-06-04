import { z } from 'zod';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  id: z.string().describe('The snapshot id to delete.'),
  fork: z
    .string()
    .optional()
    .describe(
      'Delete a snapshot on a fork by name. Omit for the parent (live) storage.'
    ),
});

export const snapshotDelete: ToolDef = {
  name: 'snapshot_delete',
  description:
    'Delete a snapshot. The underlying data is freed; any forks seeded from this snapshot remain intact.',
  access: 'write',
  inputSchema: schema,
  async execute(
    input: z.infer<typeof schema>,
    ctx
  ): Promise<{ id: string; deleted: true }> {
    const handle = storageAt(ctx.storage, input);
    await handle.snapshots.delete(
      input.id,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
    return { id: input.id, deleted: true };
  },
};
