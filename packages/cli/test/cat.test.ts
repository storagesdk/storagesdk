import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage cat', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(async () => {
    ctx = setupFs();
    await ctx.storage.upload('hello.txt', 'hello world');
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('streams bytes to stdout', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'cat',
      'hello.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe('hello world');
  });

  it('exits 1 with NotFound hint when the path is missing', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'cat',
      'missing.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Check the path');
  });

  it('reads bytes from a snapshot via --snapshot', async () => {
    const snap = await ctx.storage.snapshots.create();
    // Overwrite on base; snapshot still sees the original.
    await ctx.storage.upload('hello.txt', 'new world');

    const { exitCode, stdout } = await ctx.runCli([
      'cat',
      'hello.txt',
      '--adapter',
      'fs',
      '--snapshot',
      snap.id,
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe('hello world');
  });
});
