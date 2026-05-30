import { FEATURED_ADAPTERS } from '../data/adapters';
import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

export default function AdapterSwitcher() {
  const labels = FEATURED_ADAPTERS.map((a) => a.short);
  const snippets = FEATURED_ADAPTERS.map(
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
            Switch providers by changing the import. The rest of your code
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
