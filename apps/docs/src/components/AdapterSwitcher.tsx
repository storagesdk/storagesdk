import { ADAPTERS } from '../data/adapters';
import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

// Tabs shown in the homepage switcher. The branded Tigris aliases
// (fly, railway) live on the /adapters page only — keeping the homepage
// teaser to the eight primary backends.
const HOMEPAGE_KEYS = new Set([
  'tigris',
  's3',
  'r2',
  'gcs',
  'azure',
  'vercel',
  'minio',
  'fs',
]);

export default function AdapterSwitcher() {
  const shown = ADAPTERS.filter((a) => HOMEPAGE_KEYS.has(a.key));
  const labels = shown.map((a) => a.short);
  const snippets = shown.map(
    (a) =>
      (SNIPPETS.adapters as Record<string, string | undefined>)[a.key] ?? ''
  );
  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">one api</div>
          <h2>Same API, different provider.</h2>
          <p className="lead">
            Switch backends by changing the import. The rest of your code
            doesn't move.
          </p>
        </div>
        <CodeBlock filename="storage.ts" tabs={labels} snippets={snippets} />
        <div style={{ marginTop: 18 }}>
          <a className="feature-link" href="/adapters">
            More adapters
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
