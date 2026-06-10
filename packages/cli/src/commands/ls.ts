import type { ListOptions } from '@storagesdk/core';
import { defineCommand } from 'citty';
import { resolveAdapter } from '../adapter.js';
import { COMMON_ARGS, SCOPE_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

export const lsCommand = defineCommand({
  meta: {
    name: 'ls',
    description: 'List objects at an optional path prefix.',
  },
  args: {
    prefix: {
      type: 'positional',
      description: 'Path prefix to list. Omit to list from the root.',
      required: false,
    },
    ...COMMON_ARGS,
    ...SCOPE_ARGS,
    limit: {
      type: 'string',
      description: 'Maximum number of items to return.',
    },
    cursor: {
      type: 'string',
      description: 'Pagination cursor returned by a previous call.',
    },
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    const limit = args.limit ? Number(args.limit) : undefined;
    if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
      process.stderr.write('✗ --limit must be a non-negative integer.\n');
      process.exit(1);
    }
    try {
      const storage = await resolveAdapter({
        adapter: args.adapter,
        snapshot: args.snapshot,
        fork: args.fork,
      });
      const opts: ListOptions = {};
      if (args.prefix !== undefined) opts.prefix = args.prefix;
      if (limit !== undefined) opts.limit = limit;
      if (args.cursor !== undefined) opts.cursor = args.cursor;
      const result = await storage.list(opts);
      const human = result.items.map((i) => i.path).join('\n');
      emit(mode, human, result);
      if (mode === 'human' && result.cursor) {
        process.stderr.write(`cursor: ${result.cursor}\n`);
      }
    } catch (e) {
      handleStorageError(e);
    }
  },
});
