#!/usr/bin/env node
import { defineCommand, runMain } from 'citty';
import pkg from '../package.json' with { type: 'json' };
import { adaptersCommand } from './commands/adapters.js';

const main = defineCommand({
  meta: {
    name: 'storage',
    version: pkg.version,
    description:
      'Command-line interface for storagesdk. Talk to any backend via `storage <verb>`; boot a Model Context Protocol server with `storage mcp`.',
  },
  subCommands: {
    adapters: adaptersCommand,
  },
});

runMain(main);
