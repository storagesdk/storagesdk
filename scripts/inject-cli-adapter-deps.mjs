#!/usr/bin/env node
/**
 * Pre-pack hook for `@storagesdk/cli`: copy every adapter SDK from
 * `@storagesdk/adapters`'s `peerDependencies` into the CLI's
 * `dependencies` so the published tarball ships with a self-contained
 * install (every backend SDK ready to go, no version-walk shadowing).
 *
 * Runs as the `prepack` script. The mirror script
 * `restore-cli-package.mjs` runs as `postpack` and reverts the file,
 * so the committed source stays clean.
 *
 * `@storagesdk/adapters`'s peerDeps stay the canonical source of truth.
 * `vitest` is excluded — it's a peer for `/test-suite` consumers, not
 * an adapter SDK.
 *
 * Idempotence note: rather than detect whether the on-disk
 * `package.json` is "pristine" or "already injected", the script just
 * strips every adapter-SDK entry off the on-disk file to recover the
 * pristine view, every time. That works correctly across a clean
 * run, a crashed pack (no postpack), and manual edits added since
 * the last pack — the pristine version is whatever's on disk minus
 * the SDKs we know we own.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, '..');
const adaptersPath = join(repoRoot, 'packages/adapters/package.json');
const cliPath = join(repoRoot, 'packages/cli/package.json');
const backupPath = `${cliPath}.publishbak`;

const NON_SDK_PEERS = new Set([
  // Peer dep for `@storagesdk/adapters/test-suite` consumers, not an
  // adapter SDK. CLI doesn't ship the test-suite.
  'vitest',
]);

const adapters = JSON.parse(readFileSync(adaptersPath, 'utf8'));
const sdkPeers = Object.fromEntries(
  Object.entries(adapters.peerDependencies ?? {}).filter(
    ([name]) => !NON_SDK_PEERS.has(name)
  )
);
const sdkNames = new Set(Object.keys(sdkPeers));

const cli = JSON.parse(readFileSync(cliPath, 'utf8'));

// Pristine = on-disk minus any adapter-SDK entries. This recovers the
// committed manifest whether the on-disk file is clean, already
// injected, or has fresh edits since the last (crashed) pack.
const pristine = {
  ...cli,
  dependencies: Object.fromEntries(
    Object.entries(cli.dependencies ?? {}).filter(
      ([name]) => !sdkNames.has(name)
    )
  ),
};
const pristineRaw = `${JSON.stringify(pristine, null, 2)}\n`;

// Backup the pristine view so postpack has something to restore to.
// Safe to overwrite on every run — pristine is derived from the
// current on-disk file, not from an older backup.
writeFileSync(backupPath, pristineRaw);

const injected = {
  ...pristine,
  dependencies: Object.fromEntries(
    Object.entries({ ...pristine.dependencies, ...sdkPeers }).sort(([a], [b]) =>
      a.localeCompare(b)
    )
  ),
};

writeFileSync(cliPath, `${JSON.stringify(injected, null, 2)}\n`);

const injectedNames = Object.keys(sdkPeers).sort();
console.log(
  `inject-cli-adapter-deps: ${injectedNames.length} adapter SDK dep(s) inlined into the tarball:`
);
for (const name of injectedNames) console.log(`  ${name}@${sdkPeers[name]}`);
