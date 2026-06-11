import { defineCommand } from 'citty';
import { resolveBaseStorage } from '../adapter.js';
import { COMMON_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

export const snapshotsCommand = defineCommand({
  meta: {
    name: 'snapshots',
    description: 'List snapshots on the selected adapter.',
  },
  args: { ...COMMON_ARGS },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const list = await storage.snapshots.list();
      const human = list.map((s) => s.id).join('\n');
      emit(mode, human, list);
    } catch (e) {
      handleStorageError(e);
    }
  },
});
