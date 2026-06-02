import { describe, expect, it } from 'vitest';
import { storageAdapterTestSuite } from '../../src/test-suite.js';
import { webdav } from '../../src/webdav/webdav.js';

const URL_ENV = process.env.WEBDAV_TEST_URL;
const USERNAME = process.env.WEBDAV_TEST_USERNAME;
const PASSWORD = process.env.WEBDAV_TEST_PASSWORD;
const ROOT = process.env.WEBDAV_TEST_ROOT;

// Live tests against a real WebDAV server. The user needs write access
// to `ROOT`. For local development, `docker compose up webdav` starts
// an Apache mod_dav container on port 8080 with `user:pass` and the
// repo root configured as `/`.
//
//   WEBDAV_TEST_URL=http://localhost:8080
//   WEBDAV_TEST_USERNAME=user
//   WEBDAV_TEST_PASSWORD=pass
//   WEBDAV_TEST_ROOT=/storagesdk
const configured = Boolean(URL_ENV && ROOT);

let folderCounter = 0;
const buildAdapter = () => {
  folderCounter += 1;
  return webdav({
    baseUrl: URL_ENV as string,
    root: ROOT as string,
    folder: `t${Date.now()}-${folderCounter}`,
    ...(USERNAME !== undefined ? { username: USERNAME } : {}),
    ...(PASSWORD !== undefined ? { password: PASSWORD } : {}),
  });
};

storageAdapterTestSuite({
  name: 'webdav adapter',
  skip: !configured,
  adapter: buildAdapter,
  capabilities: {
    // WebDAV's PROPPATCH dead properties are spec but support is
    // inconsistent; the adapter drops user metadata at the boundary.
    userMetadata: false,
    contentType: true,
    // No presigned upload concept; `url()` returns the plain resource
    // URL which requires the caller to supply auth.
    presignedUploads: false,
    fetchableSignedUrls: false,
  },
  // Local bytemark/webdav runs the whole suite in ~5s; hosted servers
  // (Nextcloud, pCloud, kDrive, NAS appliances) routinely sit at
  // 1–2s per HTTP op due to auth + DB lookups, and snapshot/fork
  // tests do 5–10 ops sequentially. 90s is enough for slow real-world
  // servers; the cascaded hook timeout means cleanup doesn't expire
  // either.
  testTimeoutMs: 90_000,
});

if (!configured) {
  describe('webdav adapter (skipped)', () => {
    it('skipped: WEBDAV_TEST_URL / WEBDAV_TEST_ROOT not set', () => {
      expect(true).toBe(true);
    });
  });
}
