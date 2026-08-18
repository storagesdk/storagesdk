import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { MosaicConfig } from './mosaic.js';

export const MOSAIC_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'MOSAIC_BUCKET', required: true },
  { name: 'MOSAIC_ACCESS_KEY_ID', required: true },
  { name: 'MOSAIC_SECRET_ACCESS_KEY', required: true },
  { name: 'MOSAIC_REGION', required: false },
  { name: 'MOSAIC_ENDPOINT', required: false },
];

export function mosaicConfigFromEnv(): MosaicConfig {
  const region = optionalEnv('MOSAIC_REGION');
  const endpoint = optionalEnv('MOSAIC_ENDPOINT');
  return {
    bucket: requireEnv('MOSAIC_BUCKET'),
    accessKeyId: requireEnv('MOSAIC_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('MOSAIC_SECRET_ACCESS_KEY'),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
  };
}
