import type { UploadUrlOptions, UrlOptions } from '@storagesdk/core';
import { defineCommand } from 'citty';
import { resolveAdapter, resolveWritableStorage } from '../adapter.js';
import { COMMON_ARGS, SCOPE_ARGS, WRITE_SCOPE_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import {
  emit,
  emitError,
  rejectSnapshotFlag,
  resolveOutputMode,
} from '../output.js';

const downloadCommand = defineCommand({
  meta: {
    name: 'download',
    description: 'Generate a signed download URL for one object.',
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
    const expiresIn = parsePositiveInt(args.ttl, '--ttl');
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

const uploadCommand = defineCommand({
  meta: {
    name: 'upload',
    description:
      'Generate a signed upload URL for one object. Output is always JSON — the result carries method, url, and (for POST) form fields.',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Object path the client will upload to.',
      required: true,
    },
    adapter: {
      type: 'string',
      description: 'Adapter name. Falls back to STORAGE_ADAPTER env var.',
    },
    ...WRITE_SCOPE_ARGS,
    ttl: {
      type: 'string',
      description: 'URL lifetime in seconds. Adapter default if omitted.',
    },
    'content-type': {
      type: 'string',
      description:
        'Lock the upload to a specific Content-Type. Adapters that support it reject mismatched uploads.',
    },
    'max-size': {
      type: 'string',
      description:
        'Maximum allowed upload size in bytes. Adapter default if omitted.',
    },
    'min-size': {
      type: 'string',
      description:
        'Minimum allowed upload size in bytes. Adapter default if omitted.',
    },
  },
  async run({ args }) {
    rejectSnapshotFlag(args.snapshot);
    const expiresIn = parsePositiveInt(args.ttl, '--ttl');
    const maxSize = parsePositiveInt(args['max-size'], '--max-size');
    const minSize = parsePositiveInt(args['min-size'], '--min-size');
    try {
      const storage = await resolveWritableStorage({
        adapter: args.adapter,
        fork: args.fork,
      });
      const opts: UploadUrlOptions = {};
      if (expiresIn !== undefined) opts.expiresIn = expiresIn;
      if (args['content-type']) opts.contentType = args['content-type'];
      if (maxSize !== undefined) opts.maxSize = maxSize;
      if (minSize !== undefined) opts.minSize = minSize;
      const result = await storage.uploadUrl(args.path, opts);
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

function parsePositiveInt(
  raw: string | undefined,
  flag: string
): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    emitError(`${flag} must be a positive integer.`, `Got: ${raw}`);
    process.exit(1);
  }
  return n;
}

export const signCommand = defineCommand({
  meta: {
    name: 'sign',
    description:
      'Generate a signed URL for download or upload. Use `sign download <path>` for reads, `sign upload <path>` for writes.',
  },
  subCommands: {
    download: downloadCommand,
    upload: uploadCommand,
  },
});
