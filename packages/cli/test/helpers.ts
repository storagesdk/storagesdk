import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fs } from '@storagesdk/adapters/fs';
import { Storage } from '@storagesdk/core';
import { execa } from 'execa';

const BIN = new URL('../dist/index.js', import.meta.url).pathname;

export interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Bytes piped into the CLI's stdin (for `storage cp - storage://...`). */
  input?: string | Uint8Array;
}

/**
 * Spawn the built CLI binary with `FS_ROOT` / `FS_FOLDER` pointing at
 * the given tmp dir so the `fs` adapter resolves via `--adapter fs`.
 */
export async function run(
  args: string[],
  env: Record<string, string>,
  opts: RunOptions = {}
): Promise<RunResult> {
  const result = await execa('node', [BIN, ...args], {
    reject: false,
    env: { ...process.env, ...env },
    ...(opts.input !== undefined ? { input: opts.input } : {}),
  });
  return {
    exitCode: result.exitCode ?? 0,
    stdout: typeof result.stdout === 'string' ? result.stdout : '',
    stderr: typeof result.stderr === 'string' ? result.stderr : '',
  };
}

/**
 * Set up an fs-backed scratch storage. The caller seeds fixtures with
 * the returned `storage`, runs CLI invocations via `runCli`, then calls
 * `dispose()` in `afterAll` / `afterEach`. The CLI is pointed at the
 * same dir through `FS_ROOT` / `FS_FOLDER`.
 */
export function setupFs(): {
  storage: Storage;
  env: { FS_ROOT: string; FS_FOLDER: string };
  root: string;
  runCli: (
    args: string[],
    extraEnv?: Record<string, string>,
    opts?: RunOptions
  ) => Promise<RunResult>;
  dispose: () => void;
} {
  const root = mkdtempSync(join(tmpdir(), 'storagesdk-cli-'));
  const folder = 'scratch';
  const adapter = fs({ root, folder });
  const storage = new Storage({ adapter });
  const env = { FS_ROOT: root, FS_FOLDER: folder };
  const runCli = (
    args: string[],
    extraEnv?: Record<string, string>,
    opts?: RunOptions
  ) => run(args, { ...env, ...extraEnv }, opts);
  const dispose = () => {
    rmSync(root, { recursive: true, force: true });
  };
  return { storage, env, root, runCli, dispose };
}
