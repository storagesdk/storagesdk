import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage stat', () => {
  let ctx: ReturnType<typeof setupFs>;

  beforeEach(async () => {
    ctx = setupFs();
    await ctx.storage.upload('hello.txt', 'hello world', {
      contentType: 'text/plain',
    });
  });

  afterEach(() => {
    ctx.dispose();
  });

  it('prints metadata as JSON when piped', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'stat',
      'hello.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(0);
    const meta = JSON.parse(stdout) as {
      path: string;
      size: number;
      contentType: string;
    };
    expect(meta.path).toBe('hello.txt');
    expect(meta.size).toBe(11);
    expect(meta.contentType).toBe('text/plain');
  });

  it('prints an aligned table in human mode', async () => {
    const { exitCode, stdout } = await ctx.runCli([
      'stat',
      'hello.txt',
      '--adapter',
      'fs',
      '--no-json',
    ]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain('path');
    expect(stdout).toContain('hello.txt');
    expect(stdout).toContain('size');
    expect(stdout).toContain('11');
    expect(stdout).toContain('contentType');
    expect(stdout).toContain('text/plain');
  });

  it('exits 1 with NotFound hint when the path is missing', async () => {
    const { exitCode, stderr } = await ctx.runCli([
      'stat',
      'missing.txt',
      '--adapter',
      'fs',
    ]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain('Check the path');
  });
});
