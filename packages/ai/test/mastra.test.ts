import * as os from 'node:os';
import { fs } from '@storagesdk/adapters/fs';
import { Storage, StorageError } from '@storagesdk/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tools } from '../src/mastra/index.js';

const FS_TEST_ROOT = process.env.FS_TEST_ROOT ?? os.tmpdir();

function buildStorage(folder: string): Storage {
  return new Storage({
    adapter: fs({ root: FS_TEST_ROOT, folder }),
  });
}

interface RunnableTool {
  execute?: (input: unknown, opts: object) => Promise<unknown>;
}

type Registry = Record<string, RunnableTool>;

async function run(
  reg: Registry,
  name: string,
  input: unknown
): Promise<unknown> {
  const t = reg[name];
  if (!t?.execute) throw new Error(`tool "${name}" has no execute`);
  return t.execute(input, {});
}

describe('@storagesdk/ai/mastra', () => {
  let storage: Storage;
  let folder: string;

  beforeEach(() => {
    folder = `storagesdk-ai-mastra-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    storage = buildStorage(folder);
  });

  afterEach(async () => {
    try {
      const items = await storage.list();
      for (const item of items.items) {
        await storage.delete(item.path);
      }
      const snaps = await storage.snapshots.list();
      for (const s of snaps) await storage.snapshots.delete(s.id);
      const forksList = await storage.forks.list();
      for (const f of forksList) await storage.forks.delete(f.name);
    } catch {
      // ignore
    }
  });

  describe('tool registry', () => {
    it('returns the full 18-tool set by default', () => {
      const reg = tools(storage) as Registry;
      const names = Object.keys(reg).sort();
      expect(names).toContain('download');
      expect(names).toContain('upload');
      expect(names).toContain('snapshot_create');
      expect(names).toContain('fork_create');
      expect(names.length).toBe(18);
    });

    it('strips write tools in readOnly mode', () => {
      const reg = tools(storage, { readOnly: true });
      const names = Object.keys(reg);
      expect(names).toContain('download');
      expect(names).toContain('head');
      expect(names).toContain('list');
      expect(names).toContain('url');
      expect(names).not.toContain('upload');
      expect(names).not.toContain('delete');
      expect(names).not.toContain('snapshot_create');
      expect(names).not.toContain('fork_create');
    });

    it('keeps non-mutating snapshot/fork tools in readOnly mode', () => {
      const reg = tools(storage, { readOnly: true });
      const names = Object.keys(reg);
      expect(names).toContain('snapshot_list');
      expect(names).toContain('snapshot_head');
      expect(names).toContain('fork_list');
      expect(names).toContain('fork_head');
      expect(names).not.toContain('snapshot_delete');
      expect(names).not.toContain('fork_delete');
    });

    it('builds Mastra tools with id matching the verb name', () => {
      const reg = tools(storage) as Record<string, { id: string }>;
      expect(reg.download?.id).toBe('download');
      expect(reg.snapshot_create?.id).toBe('snapshot_create');
    });
  });

  describe('end-to-end via Mastra tool.execute', () => {
    it('round-trips text via upload + download', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'hello.txt', body: 'hi from mastra' });
      const result = (await run(reg, 'download', {
        path: 'hello.txt',
      })) as { kind: string; text: string };
      expect(result.kind).toBe('text');
      expect(result.text).toBe('hi from mastra');
    });

    it('snapshot_create + snapshot_list', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'v1.txt', body: 'one' });
      const snap = (await run(reg, 'snapshot_create', { name: 'v1' })) as {
        id: string;
      };
      expect(snap.id).toBeTruthy();

      const list = (await run(reg, 'snapshot_list', {})) as { id: string }[];
      expect(list.map((s) => s.id)).toContain(snap.id);
    });

    it('scope guard rejects out-of-scope paths', async () => {
      const reg = tools(storage, { scope: 'safe/' }) as Registry;
      await expect(
        run(reg, 'upload', { path: 'unsafe/foo.txt', body: 'no' })
      ).rejects.toBeInstanceOf(StorageError);
    });
  });
});
