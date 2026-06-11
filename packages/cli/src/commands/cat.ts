import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { defineCommand } from 'citty';
import { resolveAdapter } from '../adapter.js';
import { SCOPE_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { isPrematureClose } from '../stream.js';

export const catCommand = defineCommand({
  meta: {
    name: 'cat',
    description:
      'Stream an object to stdout. Pipe it (`storage cat foo > local`) or chain with the usual unix tools.',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Object path.',
      required: true,
    },
    // `cat` has no structured output, so it can't borrow COMMON_ARGS
    // wholesale — only `adapter` applies. `--json` would be misleading.
    adapter: {
      type: 'string',
      description: 'Adapter name. Falls back to STORAGE_ADAPTER env var.',
    },
    ...SCOPE_ARGS,
  },
  async run({ args }) {
    try {
      const storage = await resolveAdapter({
        adapter: args.adapter,
        snapshot: args.snapshot,
        fork: args.fork,
      });
      const stream = await storage.download(args.path, { as: 'stream' });
      await pipeline(Readable.fromWeb(stream), process.stdout);
    } catch (e) {
      // Clean shell-side termination (`storage cat foo | head`) is not
      // a transfer failure — exit 0.
      if (isPrematureClose(e)) return;
      handleStorageError(e);
    }
  },
});
