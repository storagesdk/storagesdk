import type { ForkInfo } from '@storagesdk/core';
import { z } from 'zod';
import type { ToolDef } from '../types.js';

const schema = z.object({
  name: z.string().describe('Name of the new fork (must be unique).'),
  fromSnapshot: z
    .string()
    .optional()
    .describe(
      'Seed from a specific snapshot id. Omit to seed from live state.'
    ),
});

export const forkCreate: ToolDef = {
  name: 'fork_create',
  description:
    'Create a fork — an independent, writable copy of the storage that can be modified without affecting the parent. Use to try variants ("what would the codebase look like if I refactored module X?") or to isolate a risky experiment. Optionally seed from a specific snapshot.',
  access: 'write',
  inputSchema: schema,
  async execute(input: z.infer<typeof schema>, ctx): Promise<ForkInfo> {
    return ctx.storage.forks.create({
      name: input.name,
      ...(input.fromSnapshot ? { fromSnapshot: input.fromSnapshot } : {}),
      ...(ctx.options.signal ? { signal: ctx.options.signal } : {}),
    });
  },
};
