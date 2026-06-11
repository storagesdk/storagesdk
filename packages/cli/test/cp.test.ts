import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage cp', () => {
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

  it('uploads a local file to a storage:// path', async () => {
    const src = join(localDir, 'hello.txt');
    writeFileSync(src, 'hello world');
    const { exitCode } = await ctx.runCli([
      'cp',
      src,
      'storage://uploads/hello.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const item = await ctx.storage.download('uploads/hello.txt', {
      as: 'text',
    });
    expect(item).toBe('hello world');
  });

  it('downloads a storage:// object to a local file', async () => {
    await ctx.storage.upload('photos/cat.jpg', 'cat-bytes');
    const dst = join(localDir, 'cat.jpg');
    const { exitCode } = await ctx.runCli([
      'cp',
      'storage://photos/cat.jpg',
      dst,
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(readFileSync(dst, 'utf8')).toBe('cat-bytes');
  });

  it('copies remote → remote without touching the local filesystem', async () => {
    await ctx.storage.upload('a.txt', 'a-content');
    const { exitCode } = await ctx.runCli([
      'cp',
      'storage://a.txt',
      'storage://b.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(await ctx.storage.download('b.txt', { as: 'text' })).toBe(
      'a-content'
    );
  });

  it('uploads from stdin with `-` as the source', async () => {
    const { exitCode } = await ctx.runCli(
      ['cp', '-', 'storage://from-stdin.txt', '--adapter', 'fs'],
      undefined,
      { input: 'piped content' }
    );
    expect(exitCode).toBe(0);
    expect(await ctx.storage.download('from-stdin.txt', { as: 'text' })).toBe(
      'piped content'
    );
  });

  it('streams to stdout with `-` as the destination', async () => {
    await ctx.storage.upload('config.json', '{"k":"v"}');
    const { exitCode, stdout } = await ctx.runCli([
      'cp',
      'storage://config.json',
      '-',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe('{"k":"v"}');
  });

  it('rejects local → local', async () => {
    const a = join(localDir, 'a.txt');
    const b = join(localDir, 'b.txt');
    writeFileSync(a, 'a');
    const { exitCode, stderr } = await ctx.runCli([
      'cp',
      a,
      b,
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('at least one side must be remote');
  });

  it('scopes uploads through --fork', async () => {
    await ctx.storage.forks.create({ name: 'experiment' });
    const src = join(localDir, 'fork.txt');
    writeFileSync(src, 'in fork');
    const { exitCode } = await ctx.runCli([
      'cp',
      src,
      'storage://fork.txt',
      '--adapter',
      'fs',
      '--fork',
      'experiment',
    ]);
    expect(exitCode).toBe(0);
    const fork = ctx.storage.forks.get('experiment');
    expect(await fork.download('fork.txt', { as: 'text' })).toBe('in fork');
    // Base storage should not see the upload.
    await expect(ctx.storage.head('fork.txt')).rejects.toThrow();
  });

  it('rejects --snapshot (snapshots are read-only)', async () => {
    const src = join(localDir, 'wont-upload.txt');
    writeFileSync(src, 'x');
    const { exitCode, stderr } = await ctx.runCli([
      'cp',
      src,
      'storage://wont-upload.txt',
      '--adapter',
      'fs',
      '--snapshot',
      'whatever',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--snapshot cannot be used with write commands');
  });

  it('prints a success line on stderr (default human mode)', async () => {
    const src = join(localDir, 'noisy.txt');
    writeFileSync(src, 'x');
    const { exitCode, stdout, stderr } = await ctx.runCli(
      ['cp', src, 'storage://noisy.txt', '--adapter', 'fs', '--no-json'],
      undefined
    );
    expect(exitCode).toBe(0);
    expect(stderr).toContain('Copied');
    expect(stderr).toContain('storage://noisy.txt');
    expect(stdout).toBe('');
  });

  it('emits a JSON object on stdout in JSON mode', async () => {
    const src = join(localDir, 'json.txt');
    writeFileSync(src, 'x');
    const { exitCode, stdout } = await ctx.runCli([
      'cp',
      src,
      'storage://json.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const info = JSON.parse(stdout) as {
      action: string;
      from: string;
      to: string;
    };
    expect(info.action).toBe('copy');
    expect(info.to).toBe('storage://json.txt');
  });

  it('stays silent when downloading to stdout', async () => {
    await ctx.storage.upload('quiet.txt', 'just bytes');
    const { exitCode, stdout, stderr } = await ctx.runCli([
      'cp',
      'storage://quiet.txt',
      '-',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toBe('just bytes');
    expect(stderr).toBe('');
  });

  it('exits 0 when the stdout consumer closes early', async () => {
    // Seed a payload larger than typical pipe buffer so `head -c 1`
    // actually closes mid-stream rather than reading the whole body
    // first.
    const big = 'x'.repeat(256 * 1024);
    await ctx.storage.upload('big.txt', big);
    // node ... cp storage://big.txt - | head -c 1
    // Using execa's pipe so head sees only the first byte.
    const { execa } = await import('execa');
    const bin = new URL('../dist/index.js', import.meta.url).pathname;
    const cli = execa(
      'node',
      [bin, 'cp', 'storage://big.txt', '-', '--adapter', 'fs'],
      {
        env: { ...process.env, ...ctx.env },
        reject: false,
      }
    );
    const result = await cli.pipe(execa('head', ['-c', '1']));
    expect(result.exitCode ?? 0).toBe(0);
  });

  it('rejects identical remote source and destination', async () => {
    await ctx.storage.upload('same.txt', 'x');
    const { exitCode, stderr } = await ctx.runCli([
      'cp',
      'storage://same.txt',
      'storage://same.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Source and destination are the same');
  });

  it('honors --content-type on uploads', async () => {
    const src = join(localDir, 'data.bin');
    writeFileSync(src, 'binary');
    const { exitCode } = await ctx.runCli([
      'cp',
      src,
      'storage://data.bin',
      '--adapter',
      'fs',
      '--content-type',
      'application/octet-stream',
    ]);
    expect(exitCode).toBe(0);
    const meta = await ctx.storage.head('data.bin');
    expect(meta.contentType).toBe('application/octet-stream');
  });
});
