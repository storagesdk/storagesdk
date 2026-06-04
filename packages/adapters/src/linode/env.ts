import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { LinodeConfig } from './linode.js';

export const LINODE_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'LINODE_BUCKET', required: true },
  { name: 'LINODE_REGION', required: true },
  { name: 'LINODE_ACCESS_KEY_ID', required: true },
  { name: 'LINODE_SECRET_ACCESS_KEY', required: true },
  { name: 'LINODE_ENDPOINT', required: false },
];

export function linodeConfigFromEnv(): LinodeConfig {
  const endpoint = optionalEnv('LINODE_ENDPOINT');
  return {
    bucket: requireEnv('LINODE_BUCKET'),
    region: requireEnv('LINODE_REGION'),
    accessKeyId: requireEnv('LINODE_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('LINODE_SECRET_ACCESS_KEY'),
    ...(endpoint ? { endpoint } : {}),
  };
}
