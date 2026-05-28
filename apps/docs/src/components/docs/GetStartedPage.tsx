import { ADAPTERS } from '../../data/adapters';
import { SNIPPETS } from '../../data/snippets';
import CodeBlock from '../CodeBlock';
import { Code, H2, H3, Note, P } from './Prose';

const MGRS = ['npm', 'pnpm', 'bun', 'yarn'] as const;

export default function GetStartedPage() {
  return (
    <article className="docs-main">
      <div className="docs-eyebrow">Get Started</div>
      <h1 className="docs-h1">Up and running in a minute.</h1>
      <P>
        <b>storagesdk</b> is a multi-provider TypeScript SDK for object storage — with{' '}
        <Code>fork</Code> and <Code>snapshot</Code> as primitives. Install the package, pick
        an adapter, build a <Code>Storage</Code>, and start calling it.
      </P>

      <H2 id="overview">Overview</H2>
      <P>
        Every operation is the same shape on every backend. You build a <Code>Storage</Code>{' '}
        by passing it an adapter — that's it. The adapter handles auth, request signing, and
        any quirks of the underlying service.
      </P>
      <P>
        Snapshots and forks are first-class. On Tigris they map to the native APIs; on every
        other backend the SDK emulates them as sibling buckets and bookkeeps the metadata so
        you don't have to. The call site stays the same either way.
      </P>
      <ul className="docs-list">
        <li>
          <b style={{ color: 'var(--fg)' }}>One API, every backend</b> — Amazon S3,
          Cloudflare R2, Tigris, GCS, Azure Blob, Vercel Blob, MinIO, and the local
          filesystem.
        </li>
        <li>
          <b style={{ color: 'var(--fg)' }}>Snapshot and fork as primitives</b> — branch a
          bucket per agent run, freeze a moment in time, replay it deterministically.
        </li>
        <li>
          <b style={{ color: 'var(--fg)' }}>Web-standard streams</b> in and out,{' '}
          <Code>AbortSignal</Code> on every method, typed <Code>StorageError</Code> codes.
        </li>
        <li>
          <b style={{ color: 'var(--fg)' }}>Typed escape hatch</b> via{' '}
          <Code>storage.raw</Code> when you need an adapter-specific operation.
        </li>
      </ul>

      <H2 id="installation">Installation</H2>
      <P>
        Install the core package and the adapters bundle with your package manager of
        choice:
      </P>
      <CodeBlock tabs={[...MGRS]} snippets={MGRS.map((m) => SNIPPETS.install[m])} />
      <Note>
        Each adapter's native SDK is an <b>optional peer dependency</b> — you only need to
        install the ones you actually use. The filesystem adapter has no peer deps and is
        the fastest way to try the API end-to-end.
      </Note>

      <H2 id="usage">Usage</H2>
      <P>
        Construct a <Code>Storage</Code>, then call its methods. <Code>upload()</Code> takes
        a string, <Code>Uint8Array</Code>, <Code>Blob</Code>, or a web{' '}
        <Code>ReadableStream</Code>. <Code>download()</Code> is overloaded by destination
        type — pass <Code>as: 'text'</Code>, <Code>'bytes'</Code>, <Code>'stream'</Code>, or
        omit it to get the full <Code>StorageItem</Code>.
      </P>
      <CodeBlock filename="first-call.ts" snippets={SNIPPETS.firstCall} />

      <H3 id="usage-snapshot-fork">Snapshot and fork</H3>
      <P>
        Freeze a bucket's state, then branch from that frozen state into a writable fork.
        Per-agent sandboxes; reproducible runs.
      </P>
      <CodeBlock filename="snapshot-and-fork.ts" snippets={SNIPPETS.hero} />
      <Note>
        On Tigris this is zero-copy and instant. On every other backend the SDK emulates
        snapshots and forks as sibling buckets it manages for you.
      </Note>

      <H2 id="adapter">Adapter</H2>
      <P>
        Switching backends means changing the import. The rest of your code doesn't move.
        Below is the same upload-and-download sequence across every first-party adapter —
        flip the tab to compare.
      </P>
      <CodeBlock
        filename="storage.ts"
        tabs={ADAPTERS.map((a) => a.short)}
        snippets={ADAPTERS.map(
          (a) => (SNIPPETS.adapters as Record<string, string | undefined>)[a.key] ?? ''
        )}
      />
      <P>
        Each adapter accepts its backend's standard config — bucket and credentials for
        cloud backends; a local <Code>root</Code> directory for filesystem. See the{' '}
        <a className="docs-link" href="/adapters">Adapters</a> section for full per-backend
        configuration, auth, and gotchas.
      </P>

      <hr className="docs-rule" />
      <div className="docs-pagination">
        <a className="docs-pager docs-pager-next" href="/api">
          <span className="docs-pager-dir">Next</span>
          <span className="docs-pager-title">API reference →</span>
        </a>
      </div>
    </article>
  );
}
