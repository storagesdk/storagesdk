import type { S3Client } from '@aws-sdk/client-s3';
import {
  type Adapter,
  checkSignal,
  StorageError,
} from '@storagesdk/core/adapter';
import { s3 } from '../s3/s3.js';

/**
 * Minimal structural shape of an Archil Disk. Passing a `disk` from the `disk`
 * package lets the adapter infer `bucket` and `region` while preserving the
 * original object for Archil-native operations.
 */
export interface ArchilDisk {
  readonly id: string;
  readonly region: string;
}

/**
 * Regions that don't sit on the default cell and so can't be derived. New
 * regions normally need no entry here; add one only when a region lives
 * somewhere other than the default cell.
 */
const ENDPOINT_OVERRIDES: Record<string, string> = {
  'gcp-us-central1': 'https://s3.blue.us-central1.gcp.prod.archil.com',
};

export interface ArchilConfig<Disk extends ArchilDisk = ArchilDisk> {
  /** Archil S3 access key id. */
  accessKeyId: string;
  /** The disk id to scope operations to. Defaults to `disk.id` when passed. */
  bucket?: string;
  /** Scope every operation to a branch of the disk instead of its main view. */
  branch?: string;
  /** Default expiry, in seconds, for presigned URLs from `url()`. */
  defaultUrlExpiresIn?: number;
  /** Archil Disk instance. Preserved at `adapter.disk` when passed. */
  disk?: Disk;
  /** Origin used to build unsigned URLs from `url()`. */
  publicBaseUrl?: string;
  /** Archil region, e.g. `aws-us-east-1` or `gcp-us-central1`. */
  region?: string;
  /** Archil S3 secret access key. */
  secretAccessKey: string;
}

export type ArchilAdapter<Disk extends ArchilDisk = ArchilDisk> =
  Adapter<S3Client> & {
    /** The branch this adapter is scoped to, if any. */
    readonly branch?: string;
    /** The underlying Archil Disk, present only when constructed with `disk`. */
    readonly disk?: Disk;
    /** The disk id this adapter is scoped to, without any branch suffix. */
    readonly diskId: string;
  };

interface ResolvedConfig {
  accessKeyId: string;
  bucket: string;
  diskId: string;
  endpoint: string;
  region: string;
  secretAccessKey: string;
}

/** Resolve an Archil region to its S3-compatible API origin. */
export function endpointForArchilRegion(region: string): string | undefined {
  if (ENDPOINT_OVERRIDES[region]) return ENDPOINT_OVERRIDES[region];

  const dash = region.indexOf('-');
  const cloud = dash > 0 ? region.slice(0, dash) : '';
  const geo = dash > 0 ? region.slice(dash + 1) : '';
  if (!(cloud && geo)) return undefined;

  return `https://s3.green.${geo}.${cloud}.prod.archil.com`;
}

/** SigV4 signing region: the geographic part of the Archil region. */
export function archilSigningRegion(region: string): string {
  return region.replace(/^[a-z]+-/u, '');
}

/** Adapter for Archil disks via Archil's S3-compatible API. */
export function archil<Disk extends ArchilDisk = ArchilDisk>(
  config: ArchilConfig<Disk>
): ArchilAdapter<Disk> {
  const { accessKeyId, bucket, diskId, endpoint, region, secretAccessKey } =
    resolveConfig(config);

  const inner = s3({
    bucket,
    credentials: { accessKeyId, secretAccessKey },
    endpoint,
    forcePathStyle: true,
    region: archilSigningRegion(region),
  });

  return {
    ...inner,
    name: 'archil',
    diskId,
    ...(config.branch !== undefined ? { branch: config.branch } : {}),
    ...(config.disk !== undefined ? { disk: config.disk } : {}),
    url: (path, opts) => {
      checkSignal(opts?.signal);
      if (config.publicBaseUrl !== undefined) {
        return Promise.resolve(
          `${config.publicBaseUrl.replace(/\/+$/u, '')}/${normalizePath(path)}`
        );
      }

      if (
        opts?.expiresIn !== undefined ||
        config.defaultUrlExpiresIn === undefined
      ) {
        return inner.url(path, opts);
      }

      return inner.url(path, {
        ...opts,
        expiresIn: config.defaultUrlExpiresIn,
      });
    },
  };
}

function resolveConfig<Disk extends ArchilDisk>(
  config: ArchilConfig<Disk>
): ResolvedConfig {
  const diskId = config.bucket ?? config.disk?.id;
  const region = config.region ?? config.disk?.region;

  if (!diskId) {
    throw new StorageError({
      code: 'Provider',
      message:
        'archil adapter: missing `bucket` (disk id) or a `disk` instance.',
    });
  }
  if (!region) {
    throw new StorageError({
      code: 'Provider',
      message:
        'archil adapter: missing `region`. Pass `region` or a `disk` instance.',
    });
  }

  const endpoint = endpointForArchilRegion(region);
  if (!endpoint) {
    throw new StorageError({
      code: 'Provider',
      message: `archil adapter: unknown region ${JSON.stringify(region)}. Expected the form <cloud>-<geo>, e.g. aws-us-east-1.`,
    });
  }

  const { branch } = config;
  if (branch !== undefined && (branch === '' || branch.includes('/'))) {
    throw new StorageError({
      code: 'Provider',
      message: `archil adapter: invalid branch ${JSON.stringify(branch)} (must be non-empty and contain no "/").`,
    });
  }

  return {
    accessKeyId: config.accessKeyId,
    bucket: branch ? `${diskId}.${branch}` : diskId,
    diskId,
    endpoint,
    region,
    secretAccessKey: config.secretAccessKey,
  };
}

function normalizePath(path: string): string {
  if (typeof path !== 'string') {
    throw new StorageError({
      code: 'InvalidArgument',
      message: 'path must be a string',
    });
  }
  const trimmed = path.replace(/^\/+/, '');
  if (trimmed.length === 0) {
    throw new StorageError({
      code: 'InvalidArgument',
      message: 'path must not be empty',
    });
  }
  return trimmed;
}
