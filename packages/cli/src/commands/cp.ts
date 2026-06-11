import { createWriteStream } from 'node:fs';
import { open, stat } from 'node:fs/promises';
import { Readable, type Writable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Storage, UploadOptions } from '@storagesdk/core';
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
import { type Path, parsePath } from '../scheme.js';
import { isPrematureClose } from '../stream.js';

export const cpCommand = defineCommand({
  meta: {
    name: 'cp',
    description:
      'Copy between local and remote (storage://). Use `-` for stdin/stdout.',
  },
  args: {
    src: {
      type: 'positional',
      description: 'Source: local path, `storage://<key>`, or `-` for stdin.',
      required: true,
    },
    dst: {
      type: 'positional',
      description:
        'Destination: local path, `storage://<key>`, or `-` for stdout.',
      required: true,
    },
    ...COMMON_ARGS,
    ...WRITE_SCOPE_ARGS,
    'content-type': {
      type: 'string',
      description:
        'Override the Content-Type for an upload. Otherwise the adapter guesses.',
    },
  },
  async run({ args }) {
    rejectSnapshotFlag(args.snapshot);
    const mode = resolveOutputMode(args.json);
    const src = parsePath(args.src);
    const dst = parsePath(args.dst);
    const combo = `${src.kind}>${dst.kind}`;
    if (!ALLOWED.has(combo)) {
      emitError(
        `\`cp ${args.src} ${args.dst}\` — at least one side must be remote (storage://...).`,
        'Use the shell to copy between local paths.'
      );
      process.exit(1);
    }
    if (
      src.kind === 'remote' &&
      dst.kind === 'remote' &&
      src.path === dst.path
    ) {
      emitError(
        'Source and destination are the same.',
        'Pick a different destination.'
      );
      process.exit(1);
    }
    try {
      const storage = await resolveWritableStorage({
        adapter: args.adapter,
        fork: args.fork,
      });
      const contentType = args['content-type'];
      switch (combo) {
        case 'local>remote':
          await uploadFromLocal(
            storage,
            (src as Extract<Path, { kind: 'local' }>).path,
            (dst as Extract<Path, { kind: 'remote' }>).path,
            contentType
          );
          break;
        case 'stdio>remote':
          await uploadFromStdin(
            storage,
            (dst as Extract<Path, { kind: 'remote' }>).path,
            contentType
          );
          break;
        case 'remote>local':
          await downloadToLocal(
            storage,
            (src as Extract<Path, { kind: 'remote' }>).path,
            (dst as Extract<Path, { kind: 'local' }>).path
          );
          break;
        case 'remote>stdio':
          await downloadToStdout(
            storage,
            (src as Extract<Path, { kind: 'remote' }>).path
          );
          // stdout is the data destination here — no success line, or
          // we'd pollute the user's pipe.
          return;
        case 'remote>remote':
          await storage.copy(
            (src as Extract<Path, { kind: 'remote' }>).path,
            (dst as Extract<Path, { kind: 'remote' }>).path
          );
          break;
      }
      emitWriteSuccess(mode, `Copied ${args.src} -> ${args.dst}`, {
        action: 'copy',
        from: args.src,
        to: args.dst,
      });
    } catch (e) {
      // A downstream pipe closing early (e.g. `storage cp foo - | head`)
      // is a clean shell-side termination, not a transfer failure.
      if (isPrematureClose(e)) return;
      handleStorageError(e);
    }
  },
});

const ALLOWED = new Set([
  'local>remote',
  'stdio>remote',
  'remote>local',
  'remote>stdio',
  'remote>remote',
]);

async function uploadFromLocal(
  storage: Storage,
  src: string,
  dst: string,
  contentType?: string
): Promise<void> {
  // Validate readability up front; surfaces a clear ENOENT instead of
  // a half-started upload.
  await stat(src);
  const handle = await open(src);
  try {
    const stream = Readable.toWeb(
      handle.createReadStream()
    ) as ReadableStream<Uint8Array>;
    const opts: UploadOptions = {};
    if (contentType) opts.contentType = contentType;
    await storage.upload(dst, stream, opts);
  } finally {
    await handle.close().catch(() => {});
  }
}

async function uploadFromStdin(
  storage: Storage,
  dst: string,
  contentType?: string
): Promise<void> {
  const stream = Readable.toWeb(process.stdin) as ReadableStream<Uint8Array>;
  const opts: UploadOptions = {};
  if (contentType) opts.contentType = contentType;
  await storage.upload(dst, stream, opts);
}

async function downloadToLocal(
  storage: Storage,
  src: string,
  dst: string
): Promise<void> {
  const body = await storage.download(src, { as: 'stream' });
  await pipeline(Readable.fromWeb(body), createWriteStream(dst));
}

async function downloadToStdout(storage: Storage, src: string): Promise<void> {
  const body = await storage.download(src, { as: 'stream' });
  await pipeline(Readable.fromWeb(body), process.stdout as Writable);
}
