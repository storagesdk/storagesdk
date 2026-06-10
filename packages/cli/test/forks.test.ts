import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage forks', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(() => {
    ctx = setupFs();
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('returns an empty array when no forks exist', async () => {
    const { exitCode, stdout } = await ctx.runCli(['forks', '--adapter', 'fs']);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual([]);
  });

  it('lists fork names as JSON when piped', async () => {
    await ctx.storage.upload('a.txt', 'a');
    await ctx.storage.forks.create({ name: 'alpha' });
    await ctx.storage.forks.create({ name: 'beta' });
    const { exitCode, stdout } = await ctx.runCli(['forks', '--adapter', 'fs']);
    expect(exitCode).toBe(0);
    const list = JSON.parse(stdout) as { name: string }[];
    const names = list.map((f) => f.name).sort();
    expect(names).toEqual(['alpha', 'beta']);
  });

  it('lists one fork name per line in human mode', async () => {
    await ctx.storage.upload('a.txt', 'a');
    await ctx.storage.forks.create({ name: 'solo' });
    const { exitCode, stdout } = await ctx.runCli([
      'forks',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('solo');
  });
});
