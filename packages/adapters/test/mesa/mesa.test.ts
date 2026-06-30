import { describe, expect, it } from 'vitest';
import { mesaConfigFromEnv } from '../../src/mesa/env.js';
import { mesa } from '../../src/mesa/mesa.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const REPO = process.env.MESA_REPO;
const API_KEY = process.env.MESA_API_KEY;
const ORG = process.env.MESA_ORG;
const BOOKMARK = process.env.MESA_BOOKMARK;

const configured = Boolean(REPO && API_KEY);

const buildAdapter = () =>
  mesa({
    repo: REPO as string,
    apiKey: API_KEY as string,
    ...(ORG !== undefined ? { org: ORG } : {}),
    ...(BOOKMARK !== undefined ? { bookmark: BOOKMARK } : {}),
  });

storageAdapterTestSuite({
  name: 'mesa adapter',
  skip: !configured,
  adapter: buildAdapter,
  capabilities: {
    contentType: false,
    userMetadata: false,
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
});

describe('mesa config', () => {
  it('builds an adapter', () => {
    const adapter = mesa({ repo: 'app', apiKey: 'mesa_test' });
    expect(adapter.name).toBe('mesa');
    expect(adapter.raw).toBeTruthy();
  });

  it('reads env config', () => {
    const saved = process.env;
    process.env = {
      ...saved,
      MESA_REPO: 'app',
      MESA_API_KEY: 'mesa_test',
      MESA_ORG: 'acme',
      MESA_BOOKMARK: 'main',
      MESA_AUTHOR_NAME: 'Bot',
      MESA_AUTHOR_EMAIL: 'bot@example.com',
    };
    try {
      expect(mesaConfigFromEnv()).toMatchObject({
        repo: 'app',
        apiKey: 'mesa_test',
        org: 'acme',
        bookmark: 'main',
        author: { name: 'Bot', email: 'bot@example.com' },
      });
    } finally {
      process.env = saved;
    }
  });
});

if (!configured) {
  describe('mesa adapter (skipped)', () => {
    it('skipped: MESA_REPO / MESA_API_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
