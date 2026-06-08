import { ADAPTERS, getAdapterEnvVars } from '@storagesdk/adapters';

console.log(
  `\nAvailable adapters in @storagesdk/adapters (${ADAPTERS.length}):\n`
);

for (const name of ADAPTERS) {
  const envVars = getAdapterEnvVars(name);
  const namePad = Math.max(...envVars.map((v) => v.name.length));
  const requiredPad = Math.max(
    ...envVars.map((v) => (v.required ? 'required' : 'optional').length)
  );

  console.log(`${name}`);
  for (const v of envVars) {
    const requiredness = (v.required ? 'required' : 'optional').padEnd(
      requiredPad
    );
    const fallback = v.fallback?.length
      ? `  fallback: ${v.fallback.join(', ')}`
      : '';
    console.log(`  ${v.name.padEnd(namePad)}  ${requiredness}${fallback}`);
  }
  console.log('');
}
