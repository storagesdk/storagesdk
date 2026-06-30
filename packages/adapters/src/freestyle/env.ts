import type { AdapterEnvVar } from '../registry.js';
import type { FreestyleConfig } from './freestyle.js';

export const FREESTYLE_ENV_VARS = [
  { name: 'FREESTYLE_REPO_ID', required: true },
  { name: 'FREESTYLE_API_KEY', required: false },
  { name: 'FREESTYLE_ACCESS_TOKEN', required: false },
  { name: 'FREESTYLE_BRANCH', required: false },
  { name: 'FREESTYLE_BASE_URL', required: false },
  { name: 'FREESTYLE_AUTHOR_NAME', required: false },
  { name: 'FREESTYLE_AUTHOR_EMAIL', required: false },
] as const satisfies readonly AdapterEnvVar[];

export function freestyleConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): FreestyleConfig {
  const repoId = env.FREESTYLE_REPO_ID;
  if (!repoId) throw new Error('FREESTYLE_REPO_ID is required');
  if (env.FREESTYLE_API_KEY && env.FREESTYLE_ACCESS_TOKEN) {
    throw new Error(
      'Set only one of FREESTYLE_API_KEY or FREESTYLE_ACCESS_TOKEN'
    );
  }
  return {
    repoId,
    ...(env.FREESTYLE_API_KEY !== undefined
      ? { apiKey: env.FREESTYLE_API_KEY }
      : {}),
    ...(env.FREESTYLE_ACCESS_TOKEN !== undefined
      ? { accessToken: env.FREESTYLE_ACCESS_TOKEN }
      : {}),
    ...(env.FREESTYLE_BRANCH !== undefined
      ? { branch: env.FREESTYLE_BRANCH }
      : {}),
    ...(env.FREESTYLE_BASE_URL !== undefined
      ? { baseUrl: env.FREESTYLE_BASE_URL }
      : {}),
    ...(env.FREESTYLE_AUTHOR_NAME && env.FREESTYLE_AUTHOR_EMAIL
      ? {
          author: {
            name: env.FREESTYLE_AUTHOR_NAME,
            email: env.FREESTYLE_AUTHOR_EMAIL,
          },
        }
      : {}),
  };
}
