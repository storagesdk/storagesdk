import { optionalEnv, requireEnv } from '../env-helpers.js';
import type { AdapterEnvVar } from '../registry.js';
import type { SupabaseConfig } from './supabase.js';

export const SUPABASE_ENV_VARS: readonly AdapterEnvVar[] = [
  { name: 'SUPABASE_BUCKET', required: true },
  { name: 'SUPABASE_PROJECT_REF', required: true },
  { name: 'SUPABASE_ACCESS_KEY_ID', required: true },
  { name: 'SUPABASE_SECRET_ACCESS_KEY', required: true },
  { name: 'SUPABASE_REGION', required: false },
  { name: 'SUPABASE_ENDPOINT', required: false },
];

export function supabaseConfigFromEnv(): SupabaseConfig {
  const region = optionalEnv('SUPABASE_REGION');
  const endpoint = optionalEnv('SUPABASE_ENDPOINT');
  return {
    bucket: requireEnv('SUPABASE_BUCKET'),
    projectRef: requireEnv('SUPABASE_PROJECT_REF'),
    accessKeyId: requireEnv('SUPABASE_ACCESS_KEY_ID'),
    secretAccessKey: requireEnv('SUPABASE_SECRET_ACCESS_KEY'),
    ...(region ? { region } : {}),
    ...(endpoint ? { endpoint } : {}),
  };
}
