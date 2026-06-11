import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage rm', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(() => {
    ctx = setupFs();
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('removes an existing object', async () => {
    await ctx.storage.upload('throwaway.txt', 'gone');
    const { exitCode } = await ctx.runCli([
      'rm',
      'throwaway.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    await expect(ctx.storage.head('throwaway.txt')).rejects.toThrow();
  });

  it('accepts the storage:// scheme and strips it', async () => {
    await ctx.storage.upload('folder/file.md', 'doc');
    const { exitCode } = await ctx.runCli([
      'rm',
      'storage://folder/file.md',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    await expect(ctx.storage.head('folder/file.md')).rejects.toThrow();
  });

  it('rejects `-`', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'rm',
      '-',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('does not support `-`');
  });

  it('scopes the delete through --fork', async () => {
    await ctx.storage.upload('shared.txt', 'shared');
    await ctx.storage.forks.create({ name: 'experiment' });
    const fork = ctx.storage.forks.get('experiment');
    await fork.upload('only-in-fork.txt', 'fork');
    const { exitCode } = await ctx.runCli([
      'rm',
      'only-in-fork.txt',
      '--adapter',
      'fs',
      '--fork',
      'experiment',
    ]);
    expect(exitCode).toBe(0);
    await expect(fork.head('only-in-fork.txt')).rejects.toThrow();
    // Base shared object untouched.
    expect(await ctx.storage.download('shared.txt', { as: 'text' })).toBe(
      'shared'
    );
  });
});
