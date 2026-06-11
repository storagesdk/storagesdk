import type { ForkOptions } from '@storagesdk/core';
import { defineCommand } from 'citty';
import { resolveBaseStorage } from '../adapter.js';
import { COMMON_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

const createCommand = defineCommand({
  meta: {
    name: 'create',
    description: 'Create a fork. Optionally seed from a snapshot.',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Fork name. Must be unique on the adapter.',
      required: true,
    },
    ...COMMON_ARGS,
    'from-snapshot': {
      type: 'string',
      description:
        'Seed the fork from a captured snapshot. Defaults to the parent live state.',
    },
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const opts: ForkOptions = { name: args.name };
      if (args['from-snapshot']) opts.fromSnapshot = args['from-snapshot'];
      const info = await storage.forks.create(opts);
      emit(mode, info.name, info);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

const rmCommand = defineCommand({
  meta: {
    name: 'rm',
    description: 'Delete a fork by name.',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Fork name (as printed by `storage forks`).',
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
      await storage.forks.delete(args.name);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

export const forkCommand = defineCommand({
  meta: {
    name: 'fork',
    description: 'Manage forks — create one, or remove one by name.',
  },
  subCommands: {
    create: createCommand,
    rm: rmCommand,
  },
});
