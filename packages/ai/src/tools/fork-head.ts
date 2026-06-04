import type { ForkInfo } from '@storagesdk/core';
import { z } from 'zod';
import type { ToolDef } from '../types.js';

const schema = z.object({
  name: z.string().describe('The fork name.'),
});

export const forkHead: ToolDef = {
  name: 'fork_head',
  description: 'Get metadata for a single fork by name.',
  access: 'read',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<ForkInfo> {
    return ctx.storage.forks.head(
      input.name,
      ctx.options.signal ? { signal: ctx.options.signal } : undefined
    );
  },
};
