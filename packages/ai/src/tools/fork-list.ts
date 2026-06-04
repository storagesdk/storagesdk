import type { ForkInfo } from '@storagesdk/core';
import { z } from 'zod';
import type { ToolDef } from '../types.js';

const schema = z.object({});

export const forkList: ToolDef = {
  name: 'fork_list',
  description: 'List every fork of the current storage.',
  access: 'read',
  inputSchema: schema,
  async execute(_input: z.infer<typeof schema>, ctx): Promise<ForkInfo[]> {
    return ctx.storage.forks.list();
  },
};
