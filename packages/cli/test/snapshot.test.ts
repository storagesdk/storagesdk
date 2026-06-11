import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage snapshot', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(async () => {
    ctx = setupFs();
    await ctx.storage.upload('seed.txt', 'seed');
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('create returns the snapshot id', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'snapshot',
      'create',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    const id = stdout.trim();
    expect(id).toMatch(/^[a-z0-9-]+/);
    const list = await ctx.storage.snapshots.list();
    expect(list.map((s) => s.id)).toContain(id);
  });

  it('create emits SnapshotInfo as JSON when piped', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'snapshot',
      'create',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const info = JSON.parse(stdout) as { id: string; createdAt: string };
    expect(typeof info.id).toBe('string');
    expect(typeof info.createdAt).toBe('string');
  });

  it('create --name attaches a human label', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'snapshot',
      'create',
      '--adapter',
      'fs',
      '--name',
      'pre-migration',
    ]);
    expect(exitCode).toBe(0);
    const info = JSON.parse(stdout) as { id: string; name?: string };
    expect(info.name).toBe('pre-migration');
  });

  it('rm deletes the snapshot', async () => {
    const snap = await ctx.storage.snapshots.create();
    const { exitCode } = await ctx.runCli([
      'snapshot',
      'rm',
      snap.id,
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const list = await ctx.storage.snapshots.list();
    expect(list.map((s) => s.id)).not.toContain(snap.id);
  });

  it('rm is idempotent for missing ids', async () => {
    // Adapter contract: delete is a no-op on a missing id.
    const { exitCode } = await ctx.runCli([
      'snapshot',
      'rm',
      'snap-does-not-exist',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
  });
});
