import { FEATURED_ADAPTERS } from '../data/adapters';
import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

// The verb roster shown after each adapter's setup. Identical across
// every tab — the only thing that changes between providers is the
// import and the Storage init, which is the whole point of the section.
const VERBS = `// Verbs named after intent — download overloads by destination type.
await storage.upload('report.pdf', body, { contentType: 'application/pdf' });

const text = await storage.download('report.pdf', { as: 'text' });
const stream = await storage.download('large.mp4', { as: 'stream' });

await storage.head('report.pdf');
await storage.list({ prefix: 'reports/' });
await storage.copy('a.png', 'b.png');
await storage.move('tmp/x.png', 'img/x.png');
await storage.delete('old.pdf');

// Snapshots and forks sit in the same surface.
const snap = await storage.snapshots.create({ name: 'pre-deploy' });
await storage.forks.create({ name: 'experiment', fromSnapshot: snap.id });`;

function buildSnippet(key: string): string {
  const setup = (SNIPPETS.adapters as Record<string, string | undefined>)[key];
  if (!setup) return '';
  // Strip the trailing upload/download demo from the per-adapter
  // snippet (boundary is the first `await storage.upload(` after the
  // Storage init); replace with the shared verb roster below.
  const idx = setup.indexOf('\n\nawait storage.upload(');
  const head = idx >= 0 ? setup.slice(0, idx) : setup;
  return `${head}\n\n${VERBS}`;
}

export default function OneApiSection() {
  const labels = FEATURED_ADAPTERS.map((a) => a.short);
  const snippets = FEATURED_ADAPTERS.map((a) => buildSnippet(a.key));
  return (
    <section className="section" id="api">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">one api</div>
          <h2>Same API across every provider. One verb per intent.</h2>
          <p className="lead">
            Switch providers by changing the import; the call site doesn't move.
            Verbs are named after what you want — not what the backend calls it
            — and <code>download</code> overloads by destination type (
            <code>text</code>, <code>bytes</code>, <code>stream</code>, full{' '}
            <code>StorageItem</code>). Web-standard streams in and out,{' '}
            <code>AbortSignal</code> everywhere, typed <code>StorageError</code>{' '}
            codes.
          </p>
        </div>
        <CodeBlock filename="storage.ts" tabs={labels} snippets={snippets} />
        <div
          style={{
            marginTop: 18,
            display: 'flex',
            gap: 24,
            flexWrap: 'wrap',
          }}
        >
          <a className="feature-link" href="/api">
            Full API reference
            <ArrowIcon />
          </a>
          <a className="feature-link" href="/adapters/write-your-own">
            Write your own adapter
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
