import { defineCommand } from 'citty';
import { resolveBaseStorage } from '../adapter.js';
import { COMMON_ARGS } from '../args.js';
import { handleStorageError } from '../errors.js';
import { emit, resolveOutputMode } from '../output.js';

export const forksCommand = defineCommand({
  meta: {
    name: 'forks',
    description: 'List forks on the selected adapter.',
  },
  args: { ...COMMON_ARGS },
  async run({ args }) {
    const mode = resolveOutputMode(args.json);
    try {
      const storage = await resolveBaseStorage(args.adapter);
      const list = await storage.forks.list();
      const human = list.map((f) => f.name).join('\n');
      emit(mode, human, list);
    } catch (e) {
      handleStorageError(e);
    }
  },
});
