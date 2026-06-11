import type { StorageItemMeta } from '@storagesdk/core';
import { defineCommand } from 'citty';
import { resolveAdapter } from '../adapter.js';
import { COMMON_ARGS, SCOPE_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

export const statCommand = defineCommand({
  meta: {
    name: 'stat',
    description: 'Show metadata for one object.',
  },
  args: {
    path: {
      type: 'positional',
      description: 'Object path.',
      required: true,
    },
    ...COMMON_ARGS,
    ...SCOPE_ARGS,
  },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveAdapter({
        adapter: args.adapter,
        snapshot: args.snapshot,
        fork: args.fork,
      });
      const meta = await storage.head(args.path);
      emit(mode, formatHuman(meta), meta);
    } catch (e) {
      handleStorageError(e);
    }
  },
});

function formatHuman(meta: StorageItemMeta): string {
  const rows: [string, string][] = [
    ['path', meta.path],
    ['size', `${meta.size}`],
    ['contentType', meta.contentType],
    ['etag', meta.etag],
    ['lastModified', meta.lastModified.toISOString()],
  ];
  if (meta.metadata && Object.keys(meta.metadata).length > 0) {
    rows.push(['metadata', JSON.stringify(meta.metadata)]);
  }
  const labelPad = Math.max(...rows.map(([k]) => k.length));
  return rows.map(([k, v]) => `${k.padEnd(labelPad)}  ${v}`).join('\n');
}
