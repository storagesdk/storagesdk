import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { GithubConfig } from './github.js';

export const GITHUB_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'GITHUB_OWNER', required: true },
  { name: 'GITHUB_REPO', required: true },
  { name: 'GITHUB_TOKEN', required: false },
  { name: 'GITHUB_BRANCH', required: false },
  { name: 'GITHUB_BASE_URL', required: false },
];

export function githubConfigFromEnv(): GithubConfig {
  const token = optionalEnv('GITHUB_TOKEN');
  const branch = optionalEnv('GITHUB_BRANCH');
  const baseUrl = optionalEnv('GITHUB_BASE_URL');
  return {
    owner: requireEnv('GITHUB_OWNER'),
    repo: requireEnv('GITHUB_REPO'),
    ...(token ? { token } : {}),
    ...(branch ? { branch } : {}),
    ...(baseUrl ? { baseUrl } : {}),
  };
}
