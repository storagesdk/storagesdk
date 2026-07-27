import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { TensorlakeConfig } from './tensorlake.js';

export const TENSORLAKE_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'TENSORLAKE_FILESYSTEM', required: true },
  { name: 'TENSORLAKE_API_KEY', required: true, fallback: ['TENSORLAKE_PAT'] },
  { name: 'TENSORLAKE_API_URL', required: false },
  { name: 'TENSORLAKE_ORGANIZATION_ID', required: false },
  { name: 'TENSORLAKE_PROJECT_ID', required: false },
];

export function tensorlakeConfigFromEnv(): TensorlakeConfig {
  const apiUrl = optionalEnv('TENSORLAKE_API_URL');
  const organizationId = optionalEnv('TENSORLAKE_ORGANIZATION_ID');
  const projectId = optionalEnv('TENSORLAKE_PROJECT_ID');

  return {
    filesystem: requireEnv('TENSORLAKE_FILESYSTEM'),
    apiKey: requireEnv('TENSORLAKE_API_KEY', ['TENSORLAKE_PAT']),
    ...(apiUrl !== undefined ? { apiUrl } : {}),
    ...(organizationId !== undefined ? { organizationId } : {}),
    ...(projectId !== undefined ? { projectId } : {}),
  };
}
