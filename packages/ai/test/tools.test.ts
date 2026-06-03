import * as os from 'node:os';
import { fs } from '@storagesdk/adapters/fs';
import { Storage, StorageError } from '@storagesdk/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { tools } from '../src/vercel/index.js';

const FS_TEST_ROOT = process.env.FS_TEST_ROOT ?? os.tmpdir();

function buildStorage(folder: string): Storage {
  return new Storage({
    adapter: fs({ root: FS_TEST_ROOT, folder }),
  });
}

interface RunnableTool {
  execute?: (
    input: unknown,
    opts: { toolCallId: string; messages: [] }
  ) => Promise<unknown>;
}

type Registry = Record<string, RunnableTool>;

async function run(
  reg: Registry,
  name: string,
  input: unknown
): Promise<unknown> {
  const t = reg[name];
  if (!t?.execute) throw new Error(`tool "${name}" has no execute`);
  return t.execute(input, { toolCallId: 't', messages: [] });
}

describe('@storagesdk/ai/vercel', () => {
  let storage: Storage;
  let folder: string;

  beforeEach(async () => {
    folder = `storagesdk-ai-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    storage = buildStorage(folder);
  });

  afterEach(async () => {
    // Best-effort cleanup. Walk the test folder and remove everything we wrote.
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
    it('returns the full tool set by default', () => {
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
  });

  describe('read + write tools end-to-end', () => {
    it('round-trips text via upload + download', async () => {
      const reg = tools(storage) as Registry;

      await run(reg, 'upload', { path: 'hello.txt', body: 'hi there' });

      const result = (await run(reg, 'download', {
        path: 'hello.txt',
      })) as { kind: string; text: string };

      expect(result.kind).toBe('text');
      expect(result.text).toBe('hi there');
    });

    it('head returns metadata with a Date field', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'meta.txt', body: 'abc' });

      const result = (await run(reg, 'head', { path: 'meta.txt' })) as {
        size: number;
        lastModified: Date;
      };

      expect(result.size).toBe(3);
      expect(result.lastModified).toBeInstanceOf(Date);
    });

    it('list returns items with Date fields', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'a.txt', body: 'a' });
      await run(reg, 'upload', { path: 'b.txt', body: 'b' });

      const result = (await run(reg, 'list', {})) as {
        items: { path: string; lastModified: Date }[];
      };

      const paths = result.items.map((i) => i.path).sort();
      expect(paths).toContain('a.txt');
      expect(paths).toContain('b.txt');
      for (const item of result.items) {
        expect(item.lastModified).toBeInstanceOf(Date);
      }
    });

    it('delete removes a file', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'gone.txt', body: 'x' });
      await run(reg, 'delete', { path: 'gone.txt' });

      await expect(storage.head('gone.txt')).rejects.toBeInstanceOf(
        StorageError
      );
    });

    it('copy and move work', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'orig.txt', body: 'one' });
      await run(reg, 'copy', { from: 'orig.txt', to: 'orig-copy.txt' });
      await run(reg, 'move', { from: 'orig-copy.txt', to: 'moved.txt' });

      expect(await storage.head('orig.txt')).toBeTruthy();
      expect(await storage.head('moved.txt')).toBeTruthy();
      await expect(storage.head('orig-copy.txt')).rejects.toBeInstanceOf(
        StorageError
      );
    });

    it('large or binary downloads fall back to URL', async () => {
      const reg = tools(storage, { maxInlineBytes: 4 }) as Registry;
      await run(reg, 'upload', {
        path: 'big.txt',
        body: 'too long for inline',
      });

      const result = (await run(reg, 'download', { path: 'big.txt' })) as {
        kind: string;
        reason?: string;
      };
      expect(result.kind).toBe('url');
      expect(result.reason).toBe('too-large');
    });

    it('binary content type bypasses inline', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', {
        path: 'img.bin',
        body: 'fake-binary',
        contentType: 'image/png',
      });

      const result = (await run(reg, 'download', { path: 'img.bin' })) as {
        kind: string;
        reason?: string;
      };
      expect(result.kind).toBe('url');
      expect(result.reason).toBe('binary');
    });

    it('download_range echoes range on URL fallback', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', {
        path: 'big.bin',
        body: 'binary payload',
        contentType: 'image/png',
      });

      const result = (await run(reg, 'download_range', {
        path: 'big.bin',
        offset: 0,
        length: 4,
      })) as {
        kind: string;
        reason?: string;
        range?: { offset: number; length: number };
      };
      expect(result.kind).toBe('url');
      expect(result.reason).toBe('binary');
      expect(result.range).toEqual({ offset: 0, length: 4 });
    });
  });

  describe('snapshots + forks', () => {
    it('snapshot_create + snapshot_list', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'v1.txt', body: 'one' });
      const snap = (await run(reg, 'snapshot_create', { name: 'v1' })) as {
        id: string;
        name?: string;
      };
      expect(snap.id).toBeTruthy();
      expect(snap.name).toBe('v1');

      const list = (await run(reg, 'snapshot_list', {})) as { id: string }[];
      expect(list.map((s) => s.id)).toContain(snap.id);
    });

    it('fork_create + read tools target the fork', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'fork_create', { name: 'experiment' });
      await run(reg, 'upload', {
        path: 'feature.ts',
        body: 'wip',
        fork: 'experiment',
      });

      const result = (await run(reg, 'download', {
        path: 'feature.ts',
        fork: 'experiment',
      })) as { kind: string; text: string };
      expect(result.text).toBe('wip');

      // Parent should NOT see the fork's file.
      await expect(storage.head('feature.ts')).rejects.toBeInstanceOf(
        StorageError
      );
    });

    it('snapshot read via download with snapshot param', async () => {
      const reg = tools(storage) as Registry;
      await run(reg, 'upload', { path: 'doc.txt', body: 'first' });
      const snap = (await run(reg, 'snapshot_create', {})) as { id: string };

      // Overwrite the live file, snapshot still has the old content.
      await run(reg, 'upload', { path: 'doc.txt', body: 'second' });

      const result = (await run(reg, 'download', {
        path: 'doc.txt',
        snapshot: snap.id,
      })) as { kind: string; text: string };
      expect(result.text).toBe('first');
    });
  });

  describe('scope guard', () => {
    it('rejects paths outside the scope', async () => {
      const reg = tools(storage, { scope: 'safe/' }) as Registry;

      await expect(
        run(reg, 'upload', { path: 'unsafe/foo.txt', body: 'no' })
      ).rejects.toBeInstanceOf(StorageError);
    });

    it('allows paths inside the scope', async () => {
      const reg = tools(storage, { scope: 'safe/' }) as Registry;

      await run(reg, 'upload', { path: 'safe/foo.txt', body: 'ok' });
      const result = (await run(reg, 'download', {
        path: 'safe/foo.txt',
      })) as { text: string };
      expect(result.text).toBe('ok');
    });

    it('list forces prefix to the scope when none supplied', async () => {
      await storage.upload('inside/a.txt', 'a');
      await storage.upload('outside/b.txt', 'b');

      const reg = tools(storage, { scope: 'inside/' }) as Registry;
      const result = (await run(reg, 'list', {})) as {
        items: { path: string }[];
      };
      const paths = result.items.map((i) => i.path);
      expect(paths).toEqual(expect.arrayContaining(['inside/a.txt']));
      expect(paths).not.toEqual(expect.arrayContaining(['outside/b.txt']));
    });
  });
});
