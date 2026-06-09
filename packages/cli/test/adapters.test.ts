import { execa } from 'execa';
import { describe, expect, it } from 'vitest';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

async function run(args: string[]): Promise<RunResult> {
  const result = await execa('node', [BIN, ...args], { reject: false });
  return {
    exitCode: result.exitCode ?? 0,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

describe('storage adapters', () => {
  it('lists every adapter as a JSON array when piped', async () => {
    const { exitCode, stdout } = await run(['adapters']);
    expect(exitCode).toBe(0);
    const list = JSON.parse(stdout) as string[];
    expect(list).toContain('fs');
    expect(list).toContain('s3');
    expect(list).toContain('tigris');
  });

  it('lists adapter names one per line in human mode', async () => {
    const { exitCode, stdout } = await run(['adapters', '--no-json']);
    expect(exitCode).toBe(0);
    const lines = stdout.split('\n');
    expect(lines).toContain('fs');
    expect(lines).toContain('tigris');
    expect(stdout).toContain('Run `storage adapters <name>` to see env vars.');
  });

  it('shows env-var spec for a single adapter as JSON', async () => {
    const { exitCode, stdout } = await run(['adapters', 'tigris']);
    expect(exitCode).toBe(0);
    const result = JSON.parse(stdout) as {
      name: string;
      envVars: { name: string; required: boolean }[];
    };
    expect(result.name).toBe('tigris');
    const names = result.envVars.map((v) => v.name);
    expect(names).toContain('TIGRIS_BUCKET');
    expect(names).toContain('TIGRIS_ACCESS_KEY_ID');
  });

  it('includes backend-native fallback in the spec', async () => {
    const { stdout } = await run(['adapters', 's3']);
    const result = JSON.parse(stdout) as {
      envVars: { name: string; fallback?: string[] }[];
    };
    const akv = result.envVars.find((v) => v.name === 'S3_ACCESS_KEY_ID');
    expect(akv?.fallback).toContain('AWS_ACCESS_KEY_ID');
  });

  it('renders an aligned env-var table in human mode', async () => {
    const { stdout } = await run(['adapters', 's3', '--no-json']);
    expect(stdout).toContain('Env vars for s3:');
    expect(stdout).toContain('S3_BUCKET');
    expect(stdout).toContain('required');
    expect(stdout).toMatch(/fallback:\s*AWS_ACCESS_KEY_ID/);
  });

  it('errors with exit 1 on an unknown adapter and lists valid options', async () => {
    const { exitCode, stderr } = await run(['adapters', 'nope']);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Unknown adapter 'nope'");
    expect(stderr).toContain('tigris');
    expect(stderr).toContain('s3');
  });
});
