import type { ReactNode } from 'react';
import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

function C({ children }: { children: ReactNode }) {
  return (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.92em',
        color: 'var(--fg)',
      }}
    >
      {children}
    </code>
  );
}

export default function OneVerb() {
  return (
    <section className="section" id="api">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">api</div>
          <h2>One verb per intent.</h2>
          <p className="lead">
            Methods named after what you want, not what the provider calls it.{' '}
            <C>download</C> is overloaded by destination type — <C>text</C>,{' '}
            <C>bytes</C>, <C>stream</C>, or the full <C>StorageItem</C>.
            Web-standard streams in and out,
            <C> AbortSignal</C> everywhere, typed <C>StorageError</C> codes.
          </p>
        </div>
        <CodeBlock filename="ops.ts" snippets={SNIPPETS.ops} />
        <div style={{ marginTop: 20 }}>
          <a className="feature-link" href="/api">
            Full API reference
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
