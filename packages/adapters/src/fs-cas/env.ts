import { requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { FsCasConfig } from './fs-cas.js';

export const FS_CAS_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'FS_CAS_ROOT', required: true },
  { name: 'FS_CAS_BUCKET', required: true },
];

export function fsCasConfigFromEnv(): FsCasConfig {
  return {
    root: requireEnv('FS_CAS_ROOT'),
    bucket: requireEnv('FS_CAS_BUCKET'),
  };
}
