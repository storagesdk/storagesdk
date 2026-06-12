#!/usr/bin/env node
/**
 * Post-pack hook for `@storagesdk/cli`: revert `packages/cli/package.json`
 * to the version that lived on disk before `inject-cli-adapter-deps.mjs`
 * ran. The tarball already captured the injected version; the source
 * tree should look like nothing happened.
 */
import { existsSync, renameSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const cliPath = join(repoRoot, 'packages/cli/package.json');
const backupPath = `${cliPath}.publishbak`;

if (!existsSync(backupPath)) {
  // Either prepack didn't run (e.g. someone invoked postpack standalone)
  // or it already restored. Either way, nothing to do.
  process.exit(0);
}

renameSync(backupPath, cliPath);
console.log('restore-cli-package: packages/cli/package.json restored');
