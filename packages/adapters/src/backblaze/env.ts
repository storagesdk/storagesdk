import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { BackblazeConfig } from './backblaze.js';

export const BACKBLAZE_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'B2_BUCKET', required: true },
  { name: 'B2_REGION', required: true },
  { name: 'B2_ACCESS_KEY_ID', required: true },
  { name: 'B2_SECRET_ACCESS_KEY', required: true },
  { name: 'B2_ENDPOINT', required: false },
];

export function backblazeConfigFromEnv(): BackblazeConfig {
  const endpoint = optionalEnv('B2_ENDPOINT');
  return {
    bucket: requireEnv('B2_BUCKET'),
    region: requireEnv('B2_REGION'),
    accessKeyId: requireEnv('B2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('B2_SECRET_ACCESS_KEY'),
    ...(endpoint ? { endpoint } : {}),
  };
}
