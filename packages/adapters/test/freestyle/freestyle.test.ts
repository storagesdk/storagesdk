import { describe, expect, it } from 'vitest';
import { freestyleConfigFromEnv } from '../../src/freestyle/env.js';
import { freestyle } from '../../src/freestyle/index.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const REPO_ID = process.env.FREESTYLE_REPO_ID;
const API_KEY = process.env.FREESTYLE_API_KEY;
const ACCESS_TOKEN = process.env.FREESTYLE_ACCESS_TOKEN;
const BRANCH = process.env.FREESTYLE_BRANCH;

const configured = Boolean(REPO_ID && (API_KEY || ACCESS_TOKEN));

const buildAdapter = () =>
  freestyle({
    repoId: REPO_ID as string,
    ...(API_KEY !== undefined ? { apiKey: API_KEY } : {}),
    ...(ACCESS_TOKEN !== undefined ? { accessToken: ACCESS_TOKEN } : {}),
    ...(BRANCH !== undefined ? { branch: BRANCH } : {}),
  });

storageAdapterTestSuite({
  name: 'freestyle adapter',
  skip: true,
  adapter: buildAdapter,
  capabilities: {
    contentType: false,
    userMetadata: false,
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
});

describe('freestyle config', () => {
  it('builds an adapter', () => {
    const adapter = freestyle({ repoId: 'repo', apiKey: 'test' });
    expect(adapter.name).toBe('freestyle');
    expect(adapter.raw).toBeTruthy();
  });

  it('reads env config', () => {
    const saved = process.env;
    process.env = {
      ...saved,
      FREESTYLE_REPO_ID: 'repo',
      FREESTYLE_API_KEY: 'key',
      FREESTYLE_BRANCH: 'main',
      FREESTYLE_AUTHOR_NAME: 'Bot',
      FREESTYLE_AUTHOR_EMAIL: 'bot@example.com',
    };
    try {
      expect(freestyleConfigFromEnv()).toMatchObject({
        repoId: 'repo',
        apiKey: 'key',
        branch: 'main',
        author: { name: 'Bot', email: 'bot@example.com' },
      });
    } finally {
      process.env = saved;
    }
  });

  it('requires one auth mode at most', () => {
    expect(() =>
      freestyleConfigFromEnv({
        FREESTYLE_REPO_ID: 'repo',
        FREESTYLE_API_KEY: 'key',
        FREESTYLE_ACCESS_TOKEN: 'token',
      })
    ).toThrow(/only one/i);
  });

  it('skips live tests unless Freestyle credentials are configured', () => {
    expect(configured).toBe(Boolean(REPO_ID && (API_KEY || ACCESS_TOKEN)));
  });
});
