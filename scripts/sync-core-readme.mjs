#!/usr/bin/env node
// Keep packages/core/README.md identical to the root README. The published
// @storagesdk/core tarball needs a real file (npm pack doesn't follow
// symlinks), and CI's `diff` guard fails the build on drift. This script
// runs in pre-commit so the two never separate locally either.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const ROOT = 'README.md';
const MIRROR = 'packages/core/README.md';

const root = readFileSync(ROOT, 'utf8');
const mirror = readFileSync(MIRROR, 'utf8');

if (root !== mirror) {
  writeFileSync(MIRROR, root);
  execSync(`git add ${MIRROR}`);
  console.log(`synced ${MIRROR} ← ${ROOT}`);
}
