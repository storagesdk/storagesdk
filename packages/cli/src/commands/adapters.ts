import {
  ADAPTERS,
  type AdapterEnvVar,
  type AdapterName,
  getAdapterEnvVars,
} from '@storagesdk/adapters';
import { defineCommand } from 'citty';
import { emit, emitError, resolveOutputMode } from '../output.js';

const VALID_ADAPTERS = ADAPTERS as readonly string[];

function isAdapterName(name: string): name is AdapterName {
  return VALID_ADAPTERS.includes(name);
}

export const adaptersCommand = defineCommand({
  meta: {
    name: 'adapters',
    description: 'List available storage adapters and their env vars',
  },
  args: {
    name: {
      type: 'positional',
      description:
        'Adapter name. Omit to list every adapter; pass one to see its env vars.',
      required: false,
    },
    json: {
      type: 'boolean',
      description:
        'Force JSON output. Default is human when TTY, JSON otherwise.',
    },
  },
  run({ args }) {
    const mode = resolveOutputMode(args.json);
    const name = args.name;

    if (!name) {
      emit(mode, listAdaptersHuman(), [...ADAPTERS]);
      return;
    }

    if (!isAdapterName(name)) {
      emitError(
        `Unknown adapter '${name}'.`,
        `Available: ${[...ADAPTERS].join(', ')}`
      );
      process.exit(1);
    }

    const envVars = getAdapterEnvVars(name);
    emit(mode, envVarsHuman(name, envVars), { name, envVars });
  },
});

function listAdaptersHuman(): string {
  return `${[...ADAPTERS].join(
    '\n'
  )}\n\nRun \`storage adapters <name>\` to see env vars.`;
}

function envVarsHuman(name: string, vars: readonly AdapterEnvVar[]): string {
  const namePad = Math.max(...vars.map((v) => v.name.length));
  const requiredPad = Math.max(
    ...vars.map((v) => (v.required ? 'required' : 'optional').length)
  );
  const rows = vars.map((v) => {
    const requiredness = (v.required ? 'required' : 'optional').padEnd(
      requiredPad
    );
    const fallback = v.fallback?.length
      ? `  fallback: ${v.fallback.join(', ')}`
      : '';
    return `  ${v.name.padEnd(namePad)}  ${requiredness}${fallback}`;
  });
  return `Env vars for ${name}:\n\n${rows.join('\n')}`;
}
