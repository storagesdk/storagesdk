import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { BunnyS3Config, BunnyS3Region } from './bunny-s3.js';

export const BUNNY_S3_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'BUNNY_S3_ZONE', required: true },
  { name: 'BUNNY_S3_BUCKET', required: true },
  { name: 'BUNNY_S3_ACCESS_KEY', required: true },
  { name: 'BUNNY_S3_REGION', required: false },
  { name: 'BUNNY_S3_ENDPOINT', required: false },
];

export function bunnyS3ConfigFromEnv(): BunnyS3Config {
  const region = optionalEnv('BUNNY_S3_REGION');
  const endpoint = optionalEnv('BUNNY_S3_ENDPOINT');
  return {
    zone: requireEnv('BUNNY_S3_ZONE'),
    bucket: requireEnv('BUNNY_S3_BUCKET'),
    accessKey: requireEnv('BUNNY_S3_ACCESS_KEY'),
    ...(region ? { region: region as BunnyS3Region } : {}),
    ...(endpoint ? { endpoint } : {}),
  };
}
