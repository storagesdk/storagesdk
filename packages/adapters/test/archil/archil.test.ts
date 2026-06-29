import { describe, expect, it } from 'vitest';
import {
  archil,
  archilSigningRegion,
  endpointForArchilRegion,
} from '../../src/archil/archil.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

const BUCKET = process.env.ARCHIL_BUCKET;
const REGION = process.env.ARCHIL_REGION;
const BRANCH = process.env.ARCHIL_BRANCH;
const ACCESS_KEY_ID = process.env.ARCHIL_S3_ACCESS_KEY_ID;
const SECRET_ACCESS_KEY = process.env.ARCHIL_S3_SECRET_ACCESS_KEY;

const configured = Boolean(
  BUCKET && REGION && ACCESS_KEY_ID && SECRET_ACCESS_KEY
);

const buildAdapter = () =>
  archil({
    bucket: BUCKET as string,
    region: REGION as string,
    accessKeyId: ACCESS_KEY_ID as string,
    secretAccessKey: SECRET_ACCESS_KEY as string,
    ...(BRANCH !== undefined ? { branch: BRANCH } : {}),
  });

storageAdapterTestSuite({
  name: 'archil adapter',
  skip: !configured,
  adapter: buildAdapter,
});

describe('archil config', () => {
  it('derives default endpoints and signing regions', () => {
    expect(endpointForArchilRegion('aws-us-east-1')).toBe(
      'https://s3.green.us-east-1.aws.prod.archil.com'
    );
    expect(endpointForArchilRegion('gcp-us-central1')).toBe(
      'https://s3.blue.us-central1.gcp.prod.archil.com'
    );
    expect(endpointForArchilRegion('bad')).toBeUndefined();
    expect(archilSigningRegion('aws-us-east-1')).toBe('us-east-1');
  });

  it('uses disk defaults and preserves disk metadata', () => {
    const disk = { id: 'disk_123', region: 'aws-us-east-1' };
    const adapter = archil({
      disk,
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      branch: 'feature',
    });

    expect(adapter.name).toBe('archil');
    expect(adapter.diskId).toBe('disk_123');
    expect(adapter.branch).toBe('feature');
    expect(adapter.disk).toBe(disk);
  });

  it('returns public URLs when configured', async () => {
    const adapter = archil({
      bucket: 'disk_123',
      region: 'aws-us-east-1',
      accessKeyId: 'key',
      secretAccessKey: 'secret',
      publicBaseUrl: 'https://cdn.example.com/root/',
    });

    await expect(adapter.url('/folder/file.txt')).resolves.toBe(
      'https://cdn.example.com/root/folder/file.txt'
    );
  });

  it('rejects invalid branches', () => {
    expect(() =>
      archil({
        bucket: 'disk_123',
        region: 'aws-us-east-1',
        accessKeyId: 'key',
        secretAccessKey: 'secret',
        branch: 'bad/name',
      })
    ).toThrow(/invalid branch/);
  });
});

if (!configured) {
  describe('archil adapter (skipped)', () => {
    it('skipped: ARCHIL_BUCKET / ARCHIL_REGION / ARCHIL_S3_ACCESS_KEY_ID / ARCHIL_S3_SECRET_ACCESS_KEY not all set', () => {
      expect(true).toBe(true);
    });
  });
}
