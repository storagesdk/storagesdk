import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { TigrisConfig } from './tigris.js';

export const TIGRIS_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'TIGRIS_BUCKET', required: true },
  { name: 'TIGRIS_ACCESS_KEY_ID', required: true },
  { name: 'TIGRIS_SECRET_ACCESS_KEY', required: true },
  { name: 'TIGRIS_ENDPOINT', required: false },
  { name: 'TIGRIS_FORCE_PATH_STYLE', required: false },
];

export function tigrisConfigFromEnv(): TigrisConfig {
  const endpoint = optionalEnv('TIGRIS_ENDPOINT');
  const forcePathStyle = optionalEnv('TIGRIS_FORCE_PATH_STYLE');
  return {
    bucket: requireEnv('TIGRIS_BUCKET'),
    accessKeyId: requireEnv('TIGRIS_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('TIGRIS_SECRET_ACCESS_KEY'),
    ...(endpoint ? { endpoint } : {}),
    ...(forcePathStyle !== undefined
      ? { forcePathStyle: forcePathStyle === 'true' }
      : {}),
  };
}
