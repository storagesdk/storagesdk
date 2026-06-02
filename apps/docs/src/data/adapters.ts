// Per-adapter metadata shared across the marquee, switcher, and adapter
// grid. Keep in sync with packages/adapters/package.json's subpath exports.

interface AdapterEntry {
  /** Full name used in adapter grids, marquee, and prose. */
  name: string;
  /** Short label for compact UI like the adapter switcher tab strip. */
  short: string;
  /** Subpath / package import path. */
  sub: string;
  /** Snippet key under SNIPPETS.adapters for the switcher. */
  key: string;
  /** Set when the backend natively supports snapshots/forks (vs emulation). */
  native?: boolean;
}

// Canonical adapter order used everywhere on the site.
export const ADAPTERS: AdapterEntry[] = [
  {
    name: 'Tigris',
    short: 'Tigris',
    key: 'tigris',
    sub: '@storagesdk/adapters/tigris',
    native: true,
  },
  { name: 'Amazon S3', short: 'S3', key: 's3', sub: '@storagesdk/adapters/s3' },
  {
    name: 'Cloudflare R2',
    short: 'R2',
    key: 'r2',
    sub: '@storagesdk/adapters/r2',
  },
  {
    name: 'Google Cloud Storage',
    short: 'GCS',
    key: 'gcs',
    sub: '@storagesdk/adapters/gcs',
  },
  {
    name: 'Azure Blob',
    short: 'Azure',
    key: 'azure',
    sub: '@storagesdk/adapters/azure',
  },
  {
    name: 'Vercel Blob',
    short: 'Vercel',
    key: 'vercel',
    sub: '@storagesdk/adapters/vercel',
  },
  {
    name: 'MinIO',
    short: 'MinIO',
    key: 'minio',
    sub: '@storagesdk/adapters/minio',
  },
  {
    name: 'Backblaze B2',
    short: 'B2',
    key: 'backblaze',
    sub: '@storagesdk/adapters/backblaze',
  },
  {
    name: 'DigitalOcean Spaces',
    short: 'Spaces',
    key: 'spaces',
    sub: '@storagesdk/adapters/spaces',
  },
  {
    name: 'Wasabi',
    short: 'Wasabi',
    key: 'wasabi',
    sub: '@storagesdk/adapters/wasabi',
  },
  {
    name: 'GitHub',
    short: 'GitHub',
    key: 'github',
    sub: '@storagesdk/adapters/github',
    native: true,
  },
  {
    name: 'WebDAV',
    short: 'WebDAV',
    key: 'webdav',
    sub: '@storagesdk/adapters/webdav',
  },
  {
    name: 'Fly.io',
    short: 'Fly',
    key: 'fly',
    sub: '@storagesdk/adapters/fly',
    native: true,
  },
  {
    name: 'Railway',
    short: 'Railway',
    key: 'railway',
    sub: '@storagesdk/adapters/railway',
    native: true,
  },
  {
    name: 'Filesystem',
    short: 'FS',
    key: 'fs',
    sub: '@storagesdk/adapters/fs',
  },
];

// Subset shown in the landing-page switcher and the Get Started page —
// the eight primary providers, branded Tigris aliases (fly, railway)
// live on the /adapters pages only.
const FEATURED_KEYS = new Set([
  'tigris',
  's3',
  'r2',
  'gcs',
  'azure',
  'vercel',
  'minio',
  'fs',
]);
export const FEATURED_ADAPTERS = ADAPTERS.filter((a) =>
  FEATURED_KEYS.has(a.key)
);
