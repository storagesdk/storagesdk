import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { VercelBlobConfig } from './vercel.js';

export const VERCEL_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'VERCEL_BLOB_BUCKET', required: true },
  {
    name: 'VERCEL_BLOB_TOKEN',
    required: false,
    fallback: ['BLOB_READ_WRITE_TOKEN'],
  },
  { name: 'VERCEL_BLOB_ACCESS', required: false },
];

export function vercelConfigFromEnv(): VercelBlobConfig {
  const token = optionalEnv('VERCEL_BLOB_TOKEN', ['BLOB_READ_WRITE_TOKEN']);
  const access = optionalEnv('VERCEL_BLOB_ACCESS');
  return {
    bucket: requireEnv('VERCEL_BLOB_BUCKET'),
    ...(token ? { token } : {}),
    ...(access === 'public' || access === 'private' ? { access } : {}),
  };
}
