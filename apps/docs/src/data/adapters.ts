// Per-adapter metadata shared across the marquee, switcher, and adapter
// grid. Keep in sync with packages/adapters/package.json's subpath exports.

export interface AdapterEntry {
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

// Canonical adapter order used everywhere on the site. Cloud-first
// adapters in the order the user specified, then dev/local at the end.
export const ADAPTERS: AdapterEntry[] = [
  { name: 'Amazon S3', short: 'S3', key: 's3', sub: '@storagesdk/adapters/s3' },
  {
    name: 'Cloudflare R2',
    short: 'R2',
    key: 'r2',
    sub: '@storagesdk/adapters/r2',
  },
  {
    name: 'Tigris',
    short: 'Tigris',
    key: 'tigris',
    sub: '@storagesdk/adapters/tigris',
    native: true,
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
    name: 'Filesystem',
    short: 'FS',
    key: 'fs',
    sub: '@storagesdk/adapters/fs',
  },
];

/** Adapter backends we're considering / accepting requests for. */
export const ROADMAP_BACKENDS = [
  'Backblaze B2',
  'DigitalOcean Spaces',
  'Wasabi',
  'Linode Object Storage',
  'Oracle Cloud Object Storage',
  'IBM Cloud Object Storage',
  'Supabase Storage',
];
