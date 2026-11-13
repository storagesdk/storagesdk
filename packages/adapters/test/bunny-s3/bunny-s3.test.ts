import { DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { afterAll, describe, expect, it } from 'vitest';
import { bunnyS3 } from '../../src/bunny-s3/bunny-s3.js';
import { storageAdapterTestSuite } from '../../src/test-suite.js';

// Live tests against a real Bunny storage zone created with S3
// compatibility turned on. Skip the whole suite when the required env
// vars are missing or empty. `accessKey` is the storage zone password.
const ZONE = process.env.BUNNY_S3_ZONE;
const ACCESS_KEY = process.env.BUNNY_S3_ACCESS_KEY;
const BUCKET = process.env.BUNNY_S3_BUCKET ?? 'storagesdk-test';
const REGION = process.env.BUNNY_S3_REGION;
const ENDPOINT = process.env.BUNNY_S3_ENDPOINT;

const configured = Boolean(ZONE && ACCESS_KEY);

const buildAdapter = () =>
  bunnyS3({
    zone: ZONE as string,
    bucket: BUCKET,
    accessKey: ACCESS_KEY as string,
    ...(REGION ? { region: REGION } : {}),
    ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
  });

storageAdapterTestSuite({
  name: 'bunny-s3 adapter',
  skip: !configured,
  adapter: buildAdapter,
});

if (configured) {
  describe('bunny-s3 adapter (implementation)', () => {
    // Two logical buckets in the same zone, unique per run.
    const run = `impl-${Date.now().toString(36)}`;
    const build = (bucket: string) =>
      bunnyS3({
        zone: ZONE as string,
        bucket,
        accessKey: ACCESS_KEY as string,
        ...(REGION ? { region: REGION } : {}),
        ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),
      });
    const names = [`${run}-one`, `${run}-two`] as const;
    const [one, two] = [build(names[0]), build(names[1])];

    afterAll(async () => {
      for (const [i, adapter] of [one, two].entries()) {
        for (const fork of await adapter.forks.list()) {
          await adapter.forks.delete(fork.name);
        }
        for (const snap of await adapter.snapshots.list()) {
          await adapter.snapshots.delete(snap.id);
        }
        for (const item of (await adapter.list()).items) {
          await adapter.delete(item.path);
        }
        // The manifest is hidden from `list`, so remove it directly.
        await adapter.raw.send(
          new DeleteObjectCommand({
            Bucket: ZONE as string,
            Key: `${names[i]}/.storagesdk.metadata.json`,
          })
        );
      }
    });

    it('stores each bucket under its own key prefix in the zone', async () => {
      await one.upload('a/b.txt', 'hello', { metadata: { owner: 'me' } });
      const out = await one.raw.send(
        new ListObjectsV2Command({ Bucket: ZONE as string, Prefix: run })
      );
      expect((out.Contents ?? []).map((o) => o.Key)).toEqual([
        `${run}-one/a/b.txt`,
      ]);
      expect((await one.head('a/b.txt')).metadata).toEqual({ owner: 'me' });
      expect((await two.list()).items).toEqual([]);
    });

    it('keeps snapshots in a sibling prefix and hides the manifest', async () => {
      const snap = await one.snapshots.create();
      expect(snap.id.startsWith(`${run}-one-snapshot-`)).toBe(true);
      const out = await one.raw.send(
        new ListObjectsV2Command({
          Bucket: ZONE as string,
          Prefix: `${snap.id}/`,
        })
      );
      expect((out.Contents ?? []).map((o) => o.Key).sort()).toEqual([
        `${snap.id}/.storagesdk.metadata.json`,
        `${snap.id}/a/b.txt`,
      ]);
      expect((await one.list()).items.map((i) => i.path)).toEqual(['a/b.txt']);
    });

    it('forks.create refuses a prefix that is already in use', async () => {
      await two.upload('keep.txt', 'keep');
      await expect(
        one.forks.create({ name: `${run}-two` })
      ).rejects.toMatchObject({ code: 'Conflict' });
      await expect(
        one.forks.create({ name: `${run}-one` })
      ).rejects.toMatchObject({ code: 'Conflict' });
      expect((await two.list()).items.map((i) => i.path)).toEqual(['keep.txt']);
    });

    it('forks.delete and snapshots.delete leave unknown prefixes alone', async () => {
      await one.forks.delete(`${run}-two`);
      await one.snapshots.delete(`${run}-two`);
      expect((await two.list()).items.map((i) => i.path)).toEqual(['keep.txt']);
    });
  });
}

if (!configured) {
  describe('bunny-s3 adapter (skipped)', () => {
    it('skipped: BUNNY_S3_ZONE / BUNNY_S3_ACCESS_KEY not set', () => {
      expect(true).toBe(true);
    });
  });
}
