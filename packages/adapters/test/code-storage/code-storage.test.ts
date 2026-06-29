import { describe, expect, it } from 'vitest';
import { codeStorage } from '../../src/code-storage/code-storage.js';
import { codeStorageConfigFromEnv } from '../../src/code-storage/env.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const NAME = process.env.CODE_STORAGE_NAME;
const REPO = process.env.CODE_STORAGE_REPO;
const KEY = process.env.CODE_STORAGE_KEY;
const TOKEN = process.env.CODE_STORAGE_TOKEN;
const BRANCH = process.env.CODE_STORAGE_BRANCH;

const configured = Boolean(NAME && REPO && (KEY || TOKEN));

const buildAdapter = () =>
  codeStorage({
    name: NAME as string,
    repo: REPO as string,
    ...(KEY !== undefined ? { key: KEY } : {}),
    ...(TOKEN !== undefined ? { token: TOKEN } : {}),
    ...(BRANCH !== undefined ? { branch: BRANCH } : {}),
  });

storageAdapterTestSuite({
  name: 'code-storage adapter',
  skip: !configured,
  adapter: buildAdapter,
  capabilities: {
    contentType: false,
    userMetadata: false,
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
});

describe('code-storage config', () => {
  it('builds an adapter', () => {
    const adapter = codeStorage({
      name: 'example',
      repo: 'repo',
      token: 'token',
      branch: 'main',
    });

    expect(adapter.name).toBe('code-storage');
    expect(adapter.raw).toBeTruthy();
  });

  it('reads env config', () => {
    const saved = process.env;
    process.env = {
      ...saved,
      CODE_STORAGE_NAME: 'example',
      CODE_STORAGE_REPO: 'repo',
      CODE_STORAGE_TOKEN: 'token',
      CODE_STORAGE_BRANCH: 'main',
      CODE_STORAGE_AUTHOR_NAME: 'Bot',
      CODE_STORAGE_AUTHOR_EMAIL: 'bot@example.com',
    };
    try {
      expect(codeStorageConfigFromEnv()).toMatchObject({
        name: 'example',
        repo: 'repo',
        token: 'token',
        branch: 'main',
        author: { name: 'Bot', email: 'bot@example.com' },
      });
    } finally {
      process.env = saved;
    }
  });
});

if (!configured) {
  describe('code-storage adapter (skipped)', () => {
    it('skipped: CODE_STORAGE_NAME / CODE_STORAGE_REPO / CODE_STORAGE_KEY or CODE_STORAGE_TOKEN not set', () => {
      expect(true).toBe(true);
    });
  });
}
