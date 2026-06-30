import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { ArchilConfig } from './archil.js';

export const ARCHIL_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'ARCHIL_BUCKET', required: true },
  { name: 'ARCHIL_REGION', required: true },
  { name: 'ARCHIL_S3_ACCESS_KEY_ID', required: true },
  { name: 'ARCHIL_S3_SECRET_ACCESS_KEY', required: true },
  { name: 'ARCHIL_BRANCH', required: false },
  { name: 'ARCHIL_PUBLIC_BASE_URL', required: false },
  { name: 'ARCHIL_DEFAULT_URL_EXPIRES_IN', required: false },
];

export function archilConfigFromEnv(): ArchilConfig {
  const branch = optionalEnv('ARCHIL_BRANCH');
  const publicBaseUrl = optionalEnv('ARCHIL_PUBLIC_BASE_URL');
  const defaultUrlExpiresIn = optionalEnv('ARCHIL_DEFAULT_URL_EXPIRES_IN');

  return {
    bucket: requireEnv('ARCHIL_BUCKET'),
    region: requireEnv('ARCHIL_REGION'),
    accessKeyId: requireEnv('ARCHIL_S3_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('ARCHIL_S3_SECRET_ACCESS_KEY'),
    ...(branch !== undefined ? { branch } : {}),
    ...(publicBaseUrl !== undefined ? { publicBaseUrl } : {}),
    ...(defaultUrlExpiresIn !== undefined
      ? { defaultUrlExpiresIn: Number(defaultUrlExpiresIn) }
      : {}),
  };
}
