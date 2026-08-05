import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { NeonConfig } from './neon.js';

export const NEON_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'NEON_BUCKET', required: true },
  {
    name: 'NEON_ENDPOINT',
    required: true,
    fallback: ['AWS_ENDPOINT_URL_S3', 'S3_ENDPOINT'],
  },
  {
    name: 'NEON_ACCESS_KEY_ID',
    required: true,
    fallback: ['AWS_ACCESS_KEY_ID'],
  },
  {
    name: 'NEON_SECRET_ACCESS_KEY',
    required: true,
    fallback: ['AWS_SECRET_ACCESS_KEY'],
  },
  { name: 'NEON_REGION', required: false, fallback: ['AWS_REGION'] },
];

export function neonConfigFromEnv(): NeonConfig {
  const region = optionalEnv('NEON_REGION', ['AWS_REGION']);
  return {
    bucket: requireEnv('NEON_BUCKET'),
    endpoint: requireEnv('NEON_ENDPOINT', [
      'AWS_ENDPOINT_URL_S3',
      'S3_ENDPOINT',
    ]),
    accessKeyId: requireEnv('NEON_ACCESS_KEY_ID', ['AWS_ACCESS_KEY_ID']),
    secretAccessKey: requireEnv('NEON_SECRET_ACCESS_KEY', [
      'AWS_SECRET_ACCESS_KEY',
    ]),
    ...(region ? { region } : {}),
  };
}
