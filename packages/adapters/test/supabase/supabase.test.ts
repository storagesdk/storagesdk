import { describe, expect, it } from 'vitest';
import { supabase } from '../../src/supabase/supabase.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.SUPABASE_BUCKET;
const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
const ACCESS_KEY_ID = process.env.SUPABASE_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.SUPABASE_SECRET_ACCESS_KEY;
const ENDPOINT = process.env.SUPABASE_ENDPOINT;

// Live tests against a real Supabase Storage bucket. Skip when env
// vars are missing so contributors without credentials can run the rest.
const configured = Boolean(
  BUCKET && PROJECT_REF && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  supabase({
    bucket: BUCKET as string,
    projectRef: PROJECT_REF as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(ENDPOINT !== undefined ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'supabase adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (!configured) {
  describe('supabase adapter (skipped)', () => {
    it('skipped: SUPABASE_BUCKET / PROJECT_REF / ACCESS_KEY_ID / SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
