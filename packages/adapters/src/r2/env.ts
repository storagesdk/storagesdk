import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { R2Config } from './r2.js';

export const R2_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'R2_BUCKET', required: true },
  { name: 'R2_ACCOUNT_ID', required: true },
  { name: 'R2_ACCESS_KEY_ID', required: true },
  { name: 'R2_SECRET_ACCESS_KEY', required: true },
  { name: 'R2_ENDPOINT', required: false },
];

export function r2ConfigFromEnv(): R2Config {
  const endpoint = optionalEnv('R2_ENDPOINT');
  return {
    bucket: requireEnv('R2_BUCKET'),
    accountId: requireEnv('R2_ACCOUNT_ID'),
    accessKeyId: requireEnv('R2_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('R2_SECRET_ACCESS_KEY'),
    ...(endpoint ? { endpoint } : {}),
  };
}
