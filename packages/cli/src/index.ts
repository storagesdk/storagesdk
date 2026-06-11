#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import { adaptersCommand } from './commands/adapters.js';
import { catCommand } from './commands/cat.js';
import { cpCommand } from './commands/cp.js';
import { forkCommand } from './commands/fork.js';
import { forksCommand } from './commands/forks.js';
import { lsCommand } from './commands/ls.js';
import { mvCommand } from './commands/mv.js';
import { rmCommand } from './commands/rm.js';
import { signCommand } from './commands/sign.js';
import { snapshotCommand } from './commands/snapshot.js';
import { snapshotsCommand } from './commands/snapshots.js';
import { statCommand } from './commands/stat.js';

const main = defineCommand({
  meta: {
    name: 'storage',
    version: pkg.version,
    description:
      'Command-line interface for storagesdk. Talk to any backend via `storage <verb>`; boot a Model Context Protocol server with `storage mcp`.',
  },
  subCommands: {
    adapters: adaptersCommand,
    ls: lsCommand,
    stat: statCommand,
    cat: catCommand,
    sign: signCommand,
    cp: cpCommand,
    mv: mvCommand,
    rm: rmCommand,
    snapshots: snapshotsCommand,
    forks: forksCommand,
    snapshot: snapshotCommand,
    fork: forkCommand,
  },
});

runMain(main);
