import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  path: z.string().describe('The file path to delete.'),
  fork: z
    .string()
    .optional()
    .describe(
      'Target a fork by name. Omit to write to the parent (live) storage.'
    ),
});

export const deleteFile: ToolDef = {
  name: 'delete',
  description:
    'Delete a file from storage. Irreversible on backends without versioning. Consider calling `snapshot_create` first if you might need to undo this.',
  access: 'write',
  inputSchema: schema,
  async execute(
    input: z.infer<typeof schema>,
    ctx
  ): Promise<{ path: string; deleted: true }> {
    checkScope(ctx.options.scope, input.path);
    const handle = storageAt(ctx.storage, input);
    await handle.delete(
      input.path,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
    return { path: input.path, deleted: true };
  },
};
