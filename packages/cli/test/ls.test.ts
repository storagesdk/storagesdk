import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage ls', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(async () => {
    ctx = setupFs();
    await ctx.storage.upload('photos/cat.jpg', 'cat');
    await ctx.storage.upload('photos/dog.jpg', 'dog');
    await ctx.storage.upload('notes/todo.txt', 'todo');
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('lists every key as JSON when piped', async () => {
    const { exitCode, stdout } = await ctx.runCli(['ls', '--adapter', 'fs']);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { items: { path: string }[] };
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual([
      'notes/todo.txt',
      'photos/cat.jpg',
      'photos/dog.jpg',
    ]);
  });

  it('filters by prefix', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'ls',
      'photos/',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { items: { path: string }[] };
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual(['photos/cat.jpg', 'photos/dog.jpg']);
  });

  it('prints one path per line in human mode', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'ls',
      'photos/',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    const lines = stdout.split('\n').filter(Boolean).sort();
    expect(lines).toEqual(['photos/cat.jpg', 'photos/dog.jpg']);
  });

  it('reads adapter from STORAGE_ADAPTER env', async () => {
    const { exitCode, stdout } = await ctx.runCli(['ls', 'notes/'], {
      STORAGE_ADAPTER: 'fs',
    });
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { items: { path: string }[] };
    expect(result.items.map((i) => i.path)).toEqual(['notes/todo.txt']);
  });

  it('errors when no adapter selected', async () => {
    const { exitCode, stderr } = await ctx.runCli(['ls']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('No adapter selected');
  });

  it('rejects negative --limit', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'ls',
      '--adapter',
      'fs',
      '--limit',
      '-1',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('non-negative integer');
  });

  it('rejects non-integer --limit', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'ls',
      '--adapter',
      'fs',
      '--limit',
      '1.5',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('non-negative integer');
  });

  it('--snapshot scopes the list to a snapshot', async () => {
    // The beforeEach has photos/{cat,dog}.jpg + notes/todo.txt on base.
    const snap = await ctx.storage.snapshots.create();
    // Add an extra object on base — it should NOT appear in the snapshot view.
    await ctx.storage.upload('photos/post-snapshot.jpg', 'extra');

    const { exitCode, stdout } = await ctx.runCli([
      'ls',
      '--adapter',
      'fs',
      '--snapshot',
      snap.id,
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { items: { path: string }[] };
    const paths = result.items.map((i) => i.path).sort();
    expect(paths).toEqual([
      'notes/todo.txt',
      'photos/cat.jpg',
      'photos/dog.jpg',
    ]);
  });

  it('--fork scopes the list to a fork', async () => {
    await ctx.storage.forks.create({ name: 'experiment' });
    const fork = ctx.storage.forks.get('experiment');
    await fork.upload('fork-only.txt', 'only here');

    const { exitCode, stdout } = await ctx.runCli([
      'ls',
      '--adapter',
      'fs',
      '--fork',
      'experiment',
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { items: { path: string }[] };
    const paths = result.items.map((i) => i.path).sort();
    // Fork inherits base contents plus its own write.
    expect(paths).toContain('fork-only.txt');
    expect(paths).toContain('photos/cat.jpg');
  });

  it('exits 1 with NotFound hint when --fork does not exist', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'ls',
      '--adapter',
      'fs',
      '--fork',
      'does-not-exist',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Check the path');
  });

  it('--fork + --snapshot composes (fork-then-snapshot)', async () => {
    await ctx.storage.forks.create({ name: 'compose' });
    const fork = ctx.storage.forks.get('compose');
    await fork.upload('fork.txt', 'fork');
    const snap = await fork.snapshots.create();
    // Mutate fork after the snapshot — the snapshot view shouldn't see it.
    await fork.upload('post.txt', 'post');

    const { exitCode, stdout } = await ctx.runCli([
      'ls',
      '--adapter',
      'fs',
      '--fork',
      'compose',
      '--snapshot',
      snap.id,
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { items: { path: string }[] };
    const paths = result.items.map((i) => i.path);
    expect(paths).toContain('fork.txt');
    expect(paths).not.toContain('post.txt');
  });
});
