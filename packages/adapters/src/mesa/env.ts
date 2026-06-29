import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { MesaConfig } from './mesa.js';

export const MESA_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'MESA_REPO', required: true },
  { name: 'MESA_API_KEY', required: false },
  { name: 'MESA_ORG', required: false },
  { name: 'MESA_BOOKMARK', required: false },
  { name: 'MESA_API_URL', required: false },
  { name: 'MESA_VCS_URL', required: false },
  { name: 'MESA_AUTHOR_NAME', required: false },
  { name: 'MESA_AUTHOR_EMAIL', required: false },
];

export function mesaConfigFromEnv(): MesaConfig {
  const apiKey = optionalEnv('MESA_API_KEY');
  const org = optionalEnv('MESA_ORG');
  const bookmark = optionalEnv('MESA_BOOKMARK');
  const apiUrl = optionalEnv('MESA_API_URL');
  const vcsUrl = optionalEnv('MESA_VCS_URL');
  const authorName = optionalEnv('MESA_AUTHOR_NAME');
  const authorEmail = optionalEnv('MESA_AUTHOR_EMAIL');

  return {
    repo: requireEnv('MESA_REPO'),
    ...(apiKey !== undefined ? { apiKey } : {}),
    ...(org !== undefined ? { org } : {}),
    ...(bookmark !== undefined ? { bookmark } : {}),
    ...(apiUrl !== undefined ? { apiUrl } : {}),
    ...(vcsUrl !== undefined ? { vcsUrl } : {}),
    ...(authorName !== undefined && authorEmail !== undefined
      ? { author: { name: authorName, email: authorEmail } }
      : {}),
  };
}
