import * as os from 'node:os';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ADAPTERS, buildAdapter, getAdapterEnvVars } from '../src/index.js';

const SAVED = process.env;

beforeEach(() => {
  process.env = { ...SAVED };
});

afterEach(() => {
  process.env = SAVED;
});

describe('ADAPTERS', () => {
  it('lists every shipped adapter', () => {
    expect(ADAPTERS).toEqual([
      'fs',
      's3',
      'r2',
      'code-storage',
      'minio',
      'tigris',
      'azure',
      'gcs',
      'vercel',
      'github',
      'webdav',
      'backblaze',
      'spaces',
      'wasabi',
      'supabase',
      'linode',
      'fly',
      'railway',
    ]);
  });
});

describe('getAdapterEnvVars', () => {
  it('returns the spec for an adapter', () => {
    const vars = getAdapterEnvVars('tigris');
    const names = vars.map((v) => v.name);
    expect(names).toContain('TIGRIS_BUCKET');
    expect(names).toContain('TIGRIS_ACCESS_KEY_ID');
    expect(names).toContain('TIGRIS_SECRET_ACCESS_KEY');
  });

  it('exposes backend-native fallbacks', () => {
    const vars = getAdapterEnvVars('s3');
    const accessKeyVar = vars.find((v) => v.name === 'S3_ACCESS_KEY_ID');
    expect(accessKeyVar?.fallback).toContain('AWS_ACCESS_KEY_ID');
  });

  it('has an entry for every adapter', () => {
    for (const name of ADAPTERS) {
      expect(getAdapterEnvVars(name).length).toBeGreaterThan(0);
    }
  });
});

describe('buildAdapter (fs, no peer deps)', () => {
  it('reads env + dynamic-imports the factory + builds the adapter', async () => {
    process.env.FS_ROOT = os.tmpdir();
    process.env.FS_FOLDER = `storagesdk-registry-test-${Date.now().toString(36)}`;
    const adapter = await buildAdapter('fs');
    expect(adapter).toBeTruthy();
    expect(typeof adapter.list).toBe('function');
  });

  it('throws when a required env var is missing', async () => {
    delete process.env.FS_ROOT;
    delete process.env.FS_FOLDER;
    await expect(buildAdapter('fs')).rejects.toThrow(/FS_ROOT/);
  });

  it('honors backend-native fallback (S3 → AWS_*)', async () => {
    process.env.S3_BUCKET = 'b';
    delete process.env.S3_ACCESS_KEY_ID;
    delete process.env.S3_SECRET_ACCESS_KEY;
    process.env.AWS_ACCESS_KEY_ID = 'aws_key';
    process.env.AWS_SECRET_ACCESS_KEY = 'aws_secret';
    // Reads S3_BUCKET, falls back to AWS_* for creds — if the fallback
    // works, buildAdapter resolves; if it doesn't, it'd throw on the
    // missing credential env var before the factory is called.
    const adapter = await buildAdapter('s3');
    expect(adapter).toBeTruthy();
  });
});
