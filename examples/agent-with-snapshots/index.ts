import { anthropic } from '@ai-sdk/anthropic';
import { tools } from '@storagesdk/ai/vercel';
import { Storage } from '@storagesdk/core';
import { generateText, stepCountIs } from 'ai';
import { getAdapter } from '../adapter.js';

const SEED_FILES: Record<string, string> = {
  'utils.ts': `export function add(a: number, b: number): number {
  return a + b;
}

export function multiply(a: number, b: number): number {
  return a * b;
}

export function logAdd(a: number, b: number): number {
  const result = add(a, b);
  console.log('add', a, '+', b, '=', result);
  return result;
}
`,
  'README.md': `# tiny-utils

A handful of arithmetic helpers. Add more as needed.
`,
};

const storage = new Storage({ adapter: await getAdapter() });

// Run the demo in a fork so the parent storage stays untouched.
const forkName = `storagesdk-agent-demo-${Date.now().toString(36)}`;
console.log(`Creating fork: ${forkName}`);
await storage.forks.create({ name: forkName });
const sandbox = storage.forks.get(forkName);

for (const [p, body] of Object.entries(SEED_FILES)) {
  await sandbox.upload(p, body);
}

if (!process.env.ANTHROPIC_API_KEY) {
  console.log('\nSet ANTHROPIC_API_KEY to run the agent live.');
  console.log('Tools that would be registered:');
  for (const name of Object.keys(tools(sandbox)).sort()) {
    console.log(`  - ${name}`);
  }
  await cleanup();
  process.exit(0);
}

const result = await generateText({
  model: anthropic('claude-sonnet-4-5'),
  tools: tools(sandbox),
  stopWhen: stepCountIs(12),
  system: [
    'You are a careful refactoring assistant.',
    'Before editing any file, call snapshot_create with a descriptive name so the user can revert.',
    'After making changes, list the snapshots so the user can see what is available.',
  ].join(' '),
  prompt: [
    'Read utils.ts.',
    'Add a new helper `logMultiply` that mirrors `logAdd` but uses multiply.',
    'Snapshot before editing so the original is recoverable.',
  ].join(' '),
});

console.log('--- Agent response ---');
console.log(result.text);

console.log('\n--- Snapshots created ---');
const snaps = await sandbox.snapshots.list();
for (const s of snaps) {
  console.log(`  ${s.id} ${s.name ?? '(unnamed)'}`);
}

console.log('\n--- Final utils.ts ---');
const current = await sandbox.download('utils.ts', { as: 'text' });
console.log(current);

await cleanup();

async function cleanup(): Promise<void> {
  console.log(`\nDeleting fork: ${forkName}`);
  await storage.forks.delete(forkName);
}
