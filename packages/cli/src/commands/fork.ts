import type { DiffOptions, ForkOptions } from '@storagesdk/core';
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

const mergeCommand = defineCommand({
  meta: {
    name: 'merge',
    description:
      'Pull the fork’s files into the parent. Naive three-way diff — newer lastModified wins on overlap; deletes propagate. Prints the parent-side snapshot id taken after the merge.',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Fork name (as printed by `storage forks`).',
      required: true,
    },
    ...COMMON_ARGS,
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const info = await storage.forks.merge(args.name);
      emit(mode, info.id, info);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

const rebaseCommand = defineCommand({
  meta: {
    name: 'rebase',
    description:
      'Pull the parent’s files into the fork. Same diff shape as merge with source/dest swapped. Prints the fork-side snapshot id taken after the rebase.',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Fork name (as printed by `storage forks`).',
      required: true,
    },
    ...COMMON_ARGS,
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const info = await storage.forks.rebase(args.name);
      emit(mode, info.id, info);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

const diffCommand = defineCommand({
  meta: {
    name: 'diff',
    description:
      'Preview one direction of the three-way diff of a fork against its base. --direction ahead (default) reports what `merge` would apply to the parent; --direction behind reports what `rebase` would apply to the fork. No mutations.',
  },
  args: {
    name: {
      type: 'positional',
      description: 'Fork name (as printed by `storage forks`).',
      required: true,
    },
    ...COMMON_ARGS,
    direction: {
      type: 'string',
      description: '`ahead` (default) or `behind`.',
      default: 'ahead',
    },
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const direction = args.direction === 'behind' ? 'behind' : 'ahead';
      const opts: DiffOptions = { direction };
      const result = await storage.forks.diff(args.name, opts);
      const human = [
        `## ${direction} (what \`${direction === 'ahead' ? 'merge' : 'rebase'}\` would do)`,
        `  added:    ${result.added.join(', ') || '—'}`,
        `  modified: ${result.modified.join(', ') || '—'}`,
        `  deleted:  ${result.deleted.join(', ') || '—'}`,
      ].join('\n');
      emit(mode, human, result);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

export const forkCommand = defineCommand({
  meta: {
    name: 'fork',
    description:
      'Manage forks — create / remove, merge / rebase, or diff a fork against its base.',
  },
  subCommands: {
    create: createCommand,
    rm: rmCommand,
    merge: mergeCommand,
    rebase: rebaseCommand,
    diff: diffCommand,
  },
});
