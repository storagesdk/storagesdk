import { defineCommand } from 'citty';
import { resolveWritableStorage } from '../adapter.js';
import { COMMON_ARGS, WRITE_SCOPE_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import {
  emitError,
  emitWriteSuccess,
  rejectSnapshotFlag,
  resolveOutputMode,
} from '../output.js';
import { parsePath } from '../scheme.js';

export const rmCommand = defineCommand({
  meta: {
    name: 'rm',
    description: 'Delete one remote object.',
  },
  args: {
    path: {
      type: 'positional',
      description:
        'Object path. `storage://<key>` is accepted; bare paths are treated as remote.',
      required: true,
    },
    ...COMMON_ARGS,
    ...WRITE_SCOPE_ARGS,
  },
  async run({ args }) {
    rejectSnapshotFlag(args.snapshot);
    const mode = resolveOutputMode(args.json);
    const parsed = parsePath(args.path);
    if (parsed.kind === 'stdio') {
      emitError(
        '`rm` does not support `-`.',
        'Pass a remote object path (`storage://<key>` or just `<key>`).'
      );
      process.exit(1);
    }
    const key = parsed.path;
    try {
      const storage = await resolveWritableStorage({
        adapter: args.adapter,
        fork: args.fork,
      });
      await storage.delete(key);
      emitWriteSuccess(mode, `Deleted ${args.path}`, {
        action: 'delete',
        path: args.path,
      });
    } catch (e) {
      handleStorageError(e);
    }
  },
});
