import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { fs as fsAdapter } from '@storagesdk/adapters/fs';
import { Storage } from '@storagesdk/core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

interface Ctx {
  root: string;
  folder: string;
  storage: Storage;
  client: Client;
  dispose: () => Promise<void>;
}

async function setup(args: string[] = []): Promise<Ctx> {
  const root = mkdtempSync(join(tmpdir(), 'storagesdk-cli-mcp-'));
  const folder = 'scratch';
  const storage = new Storage({ adapter: fsAdapter({ root, folder }) });

  const transport = new StdioClientTransport({
    command: 'node',
    args: [BIN, 'mcp', '--adapter', 'fs', ...args],
    env: { ...process.env, FS_ROOT: root, FS_FOLDER: folder },
    stderr: 'pipe',
  });
  const client = new Client({ name: 'test', version: '0.0.0' }, {});
  await client.connect(transport);
  const dispose = async () => {
    await client.close();
    rmSync(root, { recursive: true, force: true });
  };
  return { root, folder, storage, client, dispose };
}

describe('storage mcp', () => {
  let ctx: Ctx | undefined;

  beforeEach(() => {
    ctx = undefined;
  });

  afterEach(async () => {
    await ctx?.dispose();
  });

  it('answers tools/list with the full roster', async () => {
    ctx = await setup();
    const { tools } = await ctx.client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(tools.length).toBe(18);
    expect(names).toContain('download');
    expect(names).toContain('upload');
    expect(names).toContain('snapshot_create');
    expect(names).toContain('fork_create');
  });

  it('strips mutators when launched with --read-only', async () => {
    ctx = await setup(['--read-only']);
    const { tools } = await ctx.client.listTools();
    const names = new Set(tools.map((t) => t.name));
    expect(names.has('list')).toBe(true);
    expect(names.has('upload')).toBe(false);
    expect(names.has('snapshot_create')).toBe(false);
  });

  it('round-trips a real tools/call against the fs adapter', async () => {
    ctx = await setup();
    await ctx.storage.upload('hello.txt', 'hi there');
    const result = await ctx.client.callTool({
      name: 'head',
      arguments: { path: 'hello.txt' },
    });
    const [content] = result.content as { type: string; text: string }[];
    if (!content) throw new Error('missing content');
    expect(content.type).toBe('text');
    const meta = JSON.parse(content.text) as { path: string; size: number };
    expect(meta.path).toBe('hello.txt');
    expect(meta.size).toBe(8);
  });
});
