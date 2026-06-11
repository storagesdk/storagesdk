import * as os from 'node:os';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { fs } from '@storagesdk/adapters/fs';
import { Storage } from '@storagesdk/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/mcp/index.js';

const FS_TEST_ROOT = process.env.FS_TEST_ROOT ?? os.tmpdir();

function buildStorage(folder: string): Storage {
  return new Storage({ adapter: fs({ root: FS_TEST_ROOT, folder }) });
}

async function connect(server: ReturnType<typeof createMcpServer>) {
  const [clientT, serverT] = InMemoryTransport.createLinkedPair();
  await server.connect(serverT);
  const client = new Client({ name: 'test', version: '0.0.0' }, {});
  await client.connect(clientT);
  return {
    client,
    dispose: () => Promise.all([client.close(), server.close()]),
  };
}

describe('@storagesdk/ai/mcp', () => {
  let storage: Storage;
  let folder: string;

  beforeEach(() => {
    folder = `storagesdk-mcp-test-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    storage = buildStorage(folder);
  });

  afterEach(async () => {
    // The fs adapter writes inside FS_TEST_ROOT/<folder>; the tests
    // don't need explicit cleanup since each describe.each writes to a
    // unique folder. Left intentionally simple.
  });

  it('registers the full 18-verb tool roster by default', async () => {
    const server = createMcpServer(storage);
    const { client, dispose } = await connect(server);
    try {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name).sort();
      // Sanity: a few canonical verbs across the roster.
      expect(names).toContain('download');
      expect(names).toContain('upload');
      expect(names).toContain('snapshot_create');
      expect(names).toContain('fork_create');
      expect(tools.length).toBe(18);
    } finally {
      await dispose();
    }
  });

  it('strips mutators when readOnly is set', async () => {
    const server = createMcpServer(storage, { readOnly: true });
    const { client, dispose } = await connect(server);
    try {
      const { tools } = await client.listTools();
      const names = new Set(tools.map((t) => t.name));
      expect(names.has('list')).toBe(true);
      expect(names.has('download')).toBe(true);
      expect(names.has('upload')).toBe(false);
      expect(names.has('snapshot_create')).toBe(false);
    } finally {
      await dispose();
    }
  });

  it('round-trips a real call against the fs adapter', async () => {
    await storage.upload('hello.txt', 'hi there');
    const server = createMcpServer(storage);
    const { client, dispose } = await connect(server);
    try {
      const result = await client.callTool({
        name: 'head',
        arguments: { path: 'hello.txt' },
      });
      const [content] = result.content as { type: string; text: string }[];
      if (!content) throw new Error('missing content');
      expect(content.type).toBe('text');
      const meta = JSON.parse(content.text) as { path: string; size: number };
      expect(meta.path).toBe('hello.txt');
      expect(meta.size).toBe(8);
    } finally {
      await dispose();
    }
  });

  it('returns a tool error result for unknown names', async () => {
    const server = createMcpServer(storage);
    const { client, dispose } = await connect(server);
    try {
      const result = await client.callTool({
        name: 'does_not_exist',
        arguments: {},
      });
      expect(result.isError).toBe(true);
    } finally {
      await dispose();
    }
  });
});
