import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage fork', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(async () => {
    ctx = setupFs();
    await ctx.storage.upload('seed.txt', 'seed');
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('create echoes the fork name and registers it', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'fork',
      'create',
      'alpha',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toBe('alpha');
    const list = await ctx.storage.forks.list();
    expect(list.map((f) => f.name)).toContain('alpha');
  });

  it('create emits ForkInfo as JSON when piped', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'fork',
      'create',
      'beta',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const info = JSON.parse(stdout) as { name: string; createdAt: string };
    expect(info.name).toBe('beta');
  });

  it('create --from-snapshot seeds the fork from a snapshot', async () => {
    const snap = await ctx.storage.snapshots.create();
    const { exitCode, stdout } = await ctx.runCli([
      'fork',
      'create',
      'gamma',
      '--adapter',
      'fs',
      '--from-snapshot',
      snap.id,
    ]);
    expect(exitCode).toBe(0);
    const info = JSON.parse(stdout) as {
      name: string;
      fromSnapshot?: string;
    };
    expect(info.fromSnapshot).toBe(snap.id);
  });

  it('rm deletes the fork', async () => {
    await ctx.storage.forks.create({ name: 'delta' });
    const { exitCode } = await ctx.runCli([
      'fork',
      'rm',
      'delta',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const list = await ctx.storage.forks.list();
    expect(list.map((f) => f.name)).not.toContain('delta');
  });

  it('rm is idempotent for missing names', async () => {
    // Adapter contract: delete is a no-op on a missing name.
    const { exitCode } = await ctx.runCli([
      'fork',
      'rm',
      'does-not-exist',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
  });
});
