import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage sign download', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(async () => {
    ctx = setupFs();
    await ctx.storage.upload('hello.txt', 'hi');
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('returns a URL string in human mode', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'sign',
      'download',
      'hello.txt',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout.trim()).toMatch(/^file:\/\//);
    expect(stdout).toContain('hello.txt');
  });

  it('wraps the URL in JSON when piped', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'sign',
      'download',
      'hello.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as { url: string };
    expect(result.url).toMatch(/^file:\/\//);
  });

  it('rejects non-numeric --ttl', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'sign',
      'download',
      'hello.txt',
      '--adapter',
      'fs',
      '--ttl',
      'soon',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive integer');
  });

  it('rejects negative --ttl', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'sign',
      'download',
      'hello.txt',
      '--adapter',
      'fs',
      '--ttl',
      '-5',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive integer');
  });
});

describe('storage sign upload', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(() => {
    ctx = setupFs();
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('returns a JSON UploadUrlResult', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'sign',
      'upload',
      'uploads/incoming.bin',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as {
      method: string;
      url: string;
    };
    // fs adapter returns PUT-style URLs.
    expect(result.method).toBe('PUT');
    expect(result.url).toMatch(/^file:\/\//);
    expect(result.url).toContain('uploads/incoming.bin');
  });

  it('rejects --snapshot (snapshots are read-only)', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'sign',
      'upload',
      'whatever.bin',
      '--adapter',
      'fs',
      '--snapshot',
      'any',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('--snapshot cannot be used with write commands');
  });

  it('rejects non-positive --max-size', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'sign',
      'upload',
      'whatever.bin',
      '--adapter',
      'fs',
      '--max-size',
      '0',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('positive integer');
  });
});
