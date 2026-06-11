import type { UrlOptions } from '@storagesdk/core';
import { defineCommand } from 'citty';
import { resolveAdapter } from '../adapter.js';
import { COMMON_ARGS, SCOPE_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

export const signCommand = defineCommand({
  meta: {
    name: 'sign',
    description: 'Generate a signed URL for one object.',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Object path.',
      required: true,
    },
    ...COMMON_ARGS,
    ...SCOPE_ARGS,
    ttl: {
      type: 'string',
      description: 'URL lifetime in seconds. Adapter default if omitted.',
    },
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    const expiresIn = args.ttl ? Number(args.ttl) : undefined;
    if (
      expiresIn !== undefined &&
      (!Number.isInteger(expiresIn) || expiresIn <= 0)
    ) {
      process.stderr.write('✗ --ttl must be a positive integer (seconds).\n');
      process.exit(1);
    }
    try {
      const storage = await resolveAdapter({
        adapter: args.adapter,
        snapshot: args.snapshot,
        fork: args.fork,
      });
      const opts: UrlOptions = {};
      if (expiresIn !== undefined) opts.expiresIn = expiresIn;
      const url = await storage.url(args.path, opts);
      emit(mode, url, { url });
    } catch (e) {
      handleStorageError(e);
    }
  },
});
