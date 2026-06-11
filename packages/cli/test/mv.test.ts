import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage mv', () => {
  let ctx: ReturnType<typeof setupFs>;
  let localDir: string;

  beforeEach(() => {
    ctx = setupFs();
    localDir = join(ctx.root, 'local');
    mkdirSync(localDir, { recursive: true });
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('uploads then removes the local source', async () => {
    const src = join(localDir, 'notes.txt');
    writeFileSync(src, 'note body');
    const { exitCode } = await ctx.runCli([
      'mv',
      src,
      'storage://notes.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(await ctx.storage.download('notes.txt', { as: 'text' })).toBe(
      'note body'
    );
    expect(existsSync(src)).toBe(false);
  });

  it('downloads then removes the remote source', async () => {
    await ctx.storage.upload('once.txt', 'once');
    const dst = join(localDir, 'once.txt');
    const { exitCode } = await ctx.runCli([
      'mv',
      'storage://once.txt',
      dst,
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(readFileSync(dst, 'utf8')).toBe('once');
    await expect(ctx.storage.head('once.txt')).rejects.toThrow();
  });

  it('moves remote → remote', async () => {
    await ctx.storage.upload('a.txt', 'a');
    const { exitCode } = await ctx.runCli([
      'mv',
      'storage://a.txt',
      'storage://b.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(await ctx.storage.download('b.txt', { as: 'text' })).toBe('a');
    await expect(ctx.storage.head('a.txt')).rejects.toThrow();
  });

  it('rejects stdin/stdout `-`', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'mv',
      '-',
      'storage://nope.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('does not support `-`');
  });

  it('rejects identical remote source and destination', async () => {
    await ctx.storage.upload('same.txt', 'x');
    const { exitCode, stderr } = await ctx.runCli([
      'mv',
      'storage://same.txt',
      'storage://same.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Source and destination are the same');
    // The destructive operation MUST not have happened.
    const meta = await ctx.storage.head('same.txt');
    expect(meta.path).toBe('same.txt');
  });

  it('rejects local → local', async () => {
    const a = join(localDir, 'a.txt');
    const b = join(localDir, 'b.txt');
    writeFileSync(a, 'a');
    const { exitCode, stderr } = await ctx.runCli([
      'mv',
      a,
      b,
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('at least one side must be remote');
  });
});
