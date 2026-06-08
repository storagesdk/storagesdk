import { requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { FsConfig } from './fs.js';

export const FS_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'FS_ROOT', required: true },
  { name: 'FS_FOLDER', required: true },
];

export function fsConfigFromEnv(): FsConfig {
  return {
    root: requireEnv('FS_ROOT'),
    folder: requireEnv('FS_FOLDER'),
  };
}
