import { defineCommand } from 'citty';
import { resolveBaseStorage } from '../adapter.js';
import { COMMON_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

const createCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'Take a snapshot. Returns the new SnapshotInfo.',
  },
  args: {
    ...COMMON_ARGS,
    name: {
      type: 'string',
      description: 'Optional human-readable name attached to the snapshot.',
    },
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const info = await storage.snapshots.create(
        args.name ? { name: args.name } : {}
      );
      emit(mode, info.id, info);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

const rmCommand = defineCommand({
  meta: {
    name: 'rm',
    description: 'Delete a snapshot by id.',
  },
  args: {
    id: {
      type: 'positional',
      description: 'Snapshot id (as printed by `storage snapshots`).',
      required: true,
    },
    adapter: {
      type: 'string',
      description: 'Adapter name. Falls back to STORAGE_ADAPTER env var.',
    },
  },
  async run({ args }) {
    try {
      const storage = await resolveBaseStorage(args.adapter);
      await storage.snapshots.delete(args.id);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

export const snapshotCommand = defineCommand({
  meta: {
    name: 'snapshot',
    description: 'Manage snapshots — create one, or remove one by id.',
  },
  subCommands: {
    create: createCommand,
    rm: rmCommand,
  },
});
