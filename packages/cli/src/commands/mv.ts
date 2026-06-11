import { createWriteStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';
import { Readable } from 'node:stream';
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

export const mvCommand = defineCommand({
  meta: {
    name: 'mv',
    description:
      'Move between local and remote (storage://). Source is removed after a successful copy.',
  },
  args: {
    src: {
      type: 'positional',
      description: 'Source: local path or `storage://<key>`.',
      required: true,
    },
    dst: {
      type: 'positional',
      description: 'Destination: local path or `storage://<key>`.',
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
    if (src.kind === 'stdio' || dst.kind === 'stdio') {
      emitError(
        '`mv` does not support `-` (stdin/stdout).',
        'Use `cp` for stream-based transfers.'
      );
      process.exit(1);
    }
    const combo = `${src.kind}>${dst.kind}`;
    if (!ALLOWED.has(combo)) {
      emitError(
        `\`mv ${args.src} ${args.dst}\` — at least one side must be remote (storage://...).`,
        'Use the shell to move between local paths.'
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
        case 'local>remote': {
          const localPath = (src as Extract<Path, { kind: 'local' }>).path;
          await uploadFromLocal(
            storage,
            localPath,
            (dst as Extract<Path, { kind: 'remote' }>).path,
            contentType
          );
          await unlink(localPath);
          break;
        }
        case 'remote>local': {
          const remotePath = (src as Extract<Path, { kind: 'remote' }>).path;
          await downloadToLocal(
            storage,
            remotePath,
            (dst as Extract<Path, { kind: 'local' }>).path
          );
          await storage.delete(remotePath);
          break;
        }
        case 'remote>remote':
          await storage.move(
            (src as Extract<Path, { kind: 'remote' }>).path,
            (dst as Extract<Path, { kind: 'remote' }>).path
          );
          break;
      }
      emitWriteSuccess(mode, `Moved ${args.src} -> ${args.dst}`, {
        action: 'move',
        from: args.src,
        to: args.dst,
      });
    } catch (e) {
      handleStorageError(e);
    }
  },
});

const ALLOWED = new Set(['local>remote', 'remote>local', 'remote>remote']);

async function uploadFromLocal(
  storage: Storage,
  src: string,
  dst: string,
  contentType?: string
): Promise<void> {
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

async function downloadToLocal(
  storage: Storage,
  src: string,
  dst: string
): Promise<void> {
  const body = await storage.download(src, { as: 'stream' });
  await pipeline(Readable.fromWeb(body), createWriteStream(dst));
}
