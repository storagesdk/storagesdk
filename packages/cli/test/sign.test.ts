import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { setupFs } from './helpers.js';

describe('storage sign', () => {
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
