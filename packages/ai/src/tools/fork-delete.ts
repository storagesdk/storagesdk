import { z } from 'zod';
import type { ToolDef } from '../types.js';

const schema = z.object({
  name: z.string().describe('The fork name to delete.'),
});

export const forkDelete: ToolDef = {
  name: 'fork_delete',
  description:
    'Delete a fork and all data inside it. Snapshots inside the fork are also removed.',
  access: 'write',
  inputSchema: schema,
  async execute(
    input: z.infer<typeof schema>,
    ctx
  ): Promise<{ name: string; deleted: true }> {
    await ctx.storage.forks.delete(
      input.name,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
    return { name: input.name, deleted: true };
  },
};
