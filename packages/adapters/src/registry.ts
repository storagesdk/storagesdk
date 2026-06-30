import type { Adapter } from '@storagesdk/core/adapter';
import { ARCHIL_ENV_VARS, archilConfigFromEnv } from './archil/env.js';
import { AZURE_ENV_VARS, azureConfigFromEnv } from './azure/env.js';
import { BACKBLAZE_ENV_VARS, backblazeConfigFromEnv } from './backblaze/env.js';
import {
  CODE_STORAGE_ENV_VARS,
  codeStorageConfigFromEnv,
} from './code-storage/env.js';
import { FLY_ENV_VARS, flyConfigFromEnv } from './fly/env.js';
import { FS_ENV_VARS, fsConfigFromEnv } from './fs/env.js';
import { GCS_ENV_VARS, gcsConfigFromEnv } from './gcs/env.js';
import { GITHUB_ENV_VARS, githubConfigFromEnv } from './github/env.js';
import { LINODE_ENV_VARS, linodeConfigFromEnv } from './linode/env.js';
import { MESA_ENV_VARS, mesaConfigFromEnv } from './mesa/env.js';
import { MINIO_ENV_VARS, minioConfigFromEnv } from './minio/env.js';
import { R2_ENV_VARS, r2ConfigFromEnv } from './r2/env.js';
import { RAILWAY_ENV_VARS, railwayConfigFromEnv } from './railway/env.js';
import { S3_ENV_VARS, s3ConfigFromEnv } from './s3/env.js';
import { SPACES_ENV_VARS, spacesConfigFromEnv } from './spaces/env.js';
import { SUPABASE_ENV_VARS, supabaseConfigFromEnv } from './supabase/env.js';
import { TIGRIS_ENV_VARS, tigrisConfigFromEnv } from './tigris/env.js';
import { VERCEL_ENV_VARS, vercelConfigFromEnv } from './vercel/env.js';
import { WASABI_ENV_VARS, wasabiConfigFromEnv } from './wasabi/env.js';
import { WEBDAV_ENV_VARS, webdavConfigFromEnv } from './webdav/env.js';

/**
 * Every adapter name shipped in `@storagesdk/adapters`. Order is
 * stable so consumers can rely on it for menus, docs generation, etc.
 */
export const ADAPTERS = [
  'fs',
  's3',
  'r2',
  'archil',
  'code-storage',
  'mesa',
  'minio',
  'tigris',
  'azure',
  'gcs',
  'vercel',
  'github',
  'webdav',
  'backblaze',
  'spaces',
  'wasabi',
  'supabase',
  'linode',
  'fly',
  'railway',
] as const;

export type AdapterName = (typeof ADAPTERS)[number];

/**
 * One env var the adapter consumes. `required` distinguishes must-have
 * inputs from optional tuning knobs; `fallback` lists backend-native
 * env vars to try if the adapter-prefixed one isn't set (e.g. the S3
 * adapter falls back to `AWS_ACCESS_KEY_ID`).
 */
export interface AdapterEnvVar {
  readonly name: string;
  readonly required: boolean;
  readonly fallback?: readonly string[];
}

const ENV_VARS: Record<AdapterName, readonly AdapterEnvVar[]> = {
  fs: FS_ENV_VARS,
  s3: S3_ENV_VARS,
  r2: R2_ENV_VARS,
  archil: ARCHIL_ENV_VARS,
  'code-storage': CODE_STORAGE_ENV_VARS,
  mesa: MESA_ENV_VARS,
  minio: MINIO_ENV_VARS,
  tigris: TIGRIS_ENV_VARS,
  azure: AZURE_ENV_VARS,
  gcs: GCS_ENV_VARS,
  vercel: VERCEL_ENV_VARS,
  github: GITHUB_ENV_VARS,
  webdav: WEBDAV_ENV_VARS,
  backblaze: BACKBLAZE_ENV_VARS,
  spaces: SPACES_ENV_VARS,
  wasabi: WASABI_ENV_VARS,
  supabase: SUPABASE_ENV_VARS,
  linode: LINODE_ENV_VARS,
  fly: FLY_ENV_VARS,
  railway: RAILWAY_ENV_VARS,
};

const CONFIG_BUILDERS: Record<AdapterName, () => unknown> = {
  fs: fsConfigFromEnv,
  s3: s3ConfigFromEnv,
  r2: r2ConfigFromEnv,
  archil: archilConfigFromEnv,
  'code-storage': codeStorageConfigFromEnv,
  mesa: mesaConfigFromEnv,
  minio: minioConfigFromEnv,
  tigris: tigrisConfigFromEnv,
  azure: azureConfigFromEnv,
  gcs: gcsConfigFromEnv,
  vercel: vercelConfigFromEnv,
  github: githubConfigFromEnv,
  webdav: webdavConfigFromEnv,
  backblaze: backblazeConfigFromEnv,
  spaces: spacesConfigFromEnv,
  wasabi: wasabiConfigFromEnv,
  supabase: supabaseConfigFromEnv,
  linode: linodeConfigFromEnv,
  fly: flyConfigFromEnv,
  railway: railwayConfigFromEnv,
};

/**
 * The env vars an adapter reads. Includes required + optional, with
 * backend-native fallbacks where applicable. Useful for CLI help text,
 * docs generation, and error messages that tell the user exactly what
 * to set.
 */
export function getAdapterEnvVars(name: AdapterName): readonly AdapterEnvVar[] {
  return ENV_VARS[name];
}

/**
 * Compose dynamic-imported factory + env-driven config. One async call
 * at startup; subsequent operations on the returned adapter are sync.
 * The factory and config builder live as internal helpers so the public
 * API stays tight — read `process.env` and call the subpath factory
 * directly (e.g. `import { tigris } from '@storagesdk/adapters/tigris'`)
 * for the rare case you need them separately.
 */
export async function buildAdapter(name: AdapterName): Promise<Adapter> {
  const factory = await loadAdapterFactory(name);
  const config = CONFIG_BUILDERS[name]();
  return factory(config as never);
}

/**
 * Internal — dynamic-import the factory for one adapter. Kept private
 * so the public surface is just `buildAdapter`; callers who want the
 * factory alone use the subpath import.
 */
async function loadAdapterFactory(
  name: AdapterName
): Promise<(config: never) => Adapter> {
  switch (name) {
    case 'fs':
      return (await import('./fs/index.js')).fs as never;
    case 's3':
      return (await import('./s3/index.js')).s3 as never;
    case 'r2':
      return (await import('./r2/index.js')).r2 as never;
    case 'archil':
      return (await import('./archil/index.js')).archil as never;
    case 'code-storage':
      return (await import('./code-storage/index.js')).codeStorage as never;
    case 'mesa':
      return (await import('./mesa/index.js')).mesa as never;
    case 'minio':
      return (await import('./minio/index.js')).minio as never;
    case 'tigris':
      return (await import('./tigris/index.js')).tigris as never;
    case 'azure':
      return (await import('./azure/index.js')).azure as never;
    case 'gcs':
      return (await import('./gcs/index.js')).gcs as never;
    case 'vercel':
      return (await import('./vercel/index.js')).vercel as never;
    case 'github':
      return (await import('./github/index.js')).github as never;
    case 'webdav':
      return (await import('./webdav/index.js')).webdav as never;
    case 'backblaze':
      return (await import('./backblaze/index.js')).backblaze as never;
    case 'spaces':
      return (await import('./spaces/index.js')).spaces as never;
    case 'wasabi':
      return (await import('./wasabi/index.js')).wasabi as never;
    case 'supabase':
      return (await import('./supabase/index.js')).supabase as never;
    case 'linode':
      return (await import('./linode/index.js')).linode as never;
    case 'fly':
      return (await import('./fly/index.js')).fly as never;
    case 'railway':
      return (await import('./railway/index.js')).railway as never;
  }
}
