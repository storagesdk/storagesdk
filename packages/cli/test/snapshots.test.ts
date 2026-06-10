import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage snapshots', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(() => {
    ctx = setupFs();
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('returns an empty array when no snapshots exist', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'snapshots',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(JSON.parse(stdout)).toEqual([]);
  });

  it('lists snapshot ids as JSON when piped', async () => {
    await ctx.storage.upload('a.txt', 'a');
    const a = await ctx.storage.snapshots.create();
    const b = await ctx.storage.snapshots.create();
    const { exitCode, stdout } = await ctx.runCli([
      'snapshots',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const list = JSON.parse(stdout) as { id: string }[];
    const ids = list.map((s) => s.id).sort();
    expect(ids).toEqual([a.id, b.id].sort());
  });

  it('lists one snapshot id per line in human mode', async () => {
    await ctx.storage.upload('a.txt', 'a');
    const snap = await ctx.storage.snapshots.create();
    const { exitCode, stdout } = await ctx.runCli([
      'snapshots',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe(snap.id);
  });
});
