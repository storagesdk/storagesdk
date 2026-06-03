import { z } from 'zod';
import { checkScope } from '../scope.js';
import type { ToolDef } from '../types.js';
import { storageAt } from './shared.js';

const schema = z.object({
  from: z.string().describe('Source path.'),
  to: z.string().describe('Destination path.'),
  fork: z
    .string()
    .optional()
    .describe(
      'Target a fork by name. Omit to write to the parent (live) storage.'
    ),
});

export const move: ToolDef = {
  name: 'move',
  description:
    'Move a file to a new path. Equivalent to copy + delete on backends without a native rename.',
  access: 'write',
  inputSchema: schema,
  async execute(
    input: z.infer<typeof schema>,
    ctx
  ): Promise<{ from: string; to: string }> {
    checkScope(ctx.options.scope, input.from);
    checkScope(ctx.options.scope, input.to);
    const handle = storageAt(ctx.storage, input);
    await handle.move(
      input.from,
      input.to,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
    return { from: input.from, to: input.to };
  },
};
