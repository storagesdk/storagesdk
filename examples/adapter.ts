import * as os from 'node:os';
import * as path from 'node:path';
import { ADAPTERS, type AdapterName, buildAdapter } from '@storagesdk/adapters';
import type { Adapter } from '@storagesdk/core/adapter';

/**
 * Pick a storage adapter for an example. Defaults to `fs` so the
 * examples run without any config; switch with `EXAMPLE_ADAPTER`
 * and set the matching adapter-native env vars (`TIGRIS_BUCKET`,
 * `S3_BUCKET` + `S3_ACCESS_KEY_ID`, etc.).
 *
 * See `@storagesdk/adapters` `getAdapterEnvVars(name)` for the exact
 * env vars each adapter reads.
 *
 * Async because `buildAdapter` dynamically imports only the adapter
 * you ask for, keeping the example bundle light.
 */
export async function getAdapter(): Promise<Adapter> {
  const choice = (process.env.EXAMPLE_ADAPTER ?? 'fs').toLowerCase();
  if (!isAdapterName(choice)) {
    throw new Error(
      `Unknown EXAMPLE_ADAPTER '${choice}'. Expected one of: ${ADAPTERS.join(', ')}`
    );
  }
  // Convenience defaults for fs so the zero-config path "just works".
  if (choice === 'fs') {
    if (!process.env.FS_ROOT) process.env.FS_ROOT = os.tmpdir();
    if (!process.env.FS_FOLDER) {
      process.env.FS_FOLDER = `storagesdk-example-${Date.now().toString(36)}`;
    }
  }
  if (choice === 'fs-cas') {
    if (!process.env.FS_CAS_ROOT) {
      process.env.FS_CAS_ROOT = path.join(
        os.tmpdir(),
        `storagesdk-example-${Date.now().toString(36)}`
      );
    }
    if (!process.env.FS_CAS_BUCKET) process.env.FS_CAS_BUCKET = 'demo';
  }
  return buildAdapter(choice);
}

function isAdapterName(name: string): name is AdapterName {
  return (ADAPTERS as readonly string[]).includes(name);
}
