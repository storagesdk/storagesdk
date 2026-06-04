/**
 * Read a required env var. Tries `name` first, then each entry in
 * `fallback` in order. Throws if none are set.
 */
export function requireEnv(name: string, fallback?: readonly string[]): string {
  const direct = process.env[name];
  if (direct) return direct;
  if (fallback) {
    for (const f of fallback) {
      const value = process.env[f];
      if (value) return value;
    }
  }
  throw new Error(
    fallback && fallback.length > 0
      ? `Missing env var ${name} (or fallback: ${fallback.join(', ')})`
      : `Missing env var ${name}`
  );
}

/**
 * Read an optional env var. Tries `name` first, then each entry in
 * `fallback` in order. Returns `undefined` if none are set.
 */
export function optionalEnv(
  name: string,
  fallback?: readonly string[]
): string | undefined {
  const direct = process.env[name];
  if (direct) return direct;
  if (fallback) {
    for (const f of fallback) {
      const value = process.env[f];
      if (value) return value;
    }
  }
  return undefined;
}
