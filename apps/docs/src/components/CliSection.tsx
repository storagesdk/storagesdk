import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

export default function CliSection() {
  const C = ({ children }: { children: string }) => (
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
  return (
    <section className="section" id="cli">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">cli</div>
          <h2>Unix verbs, every backend.</h2>
          <p className="lead">
            <C>@storagesdk/cli</C> ships POSIX-style commands — <C>ls</C>,{' '}
            <C>stat</C>, <C>cat</C>, <C>cp</C>, <C>mv</C>, <C>rm</C>,{' '}
            <C>sign</C> — that talk to every adapter. <C>cp</C> and <C>mv</C>{' '}
            use a <C>storage://</C> scheme to mark remote paths; pipes and
            redirects work the way you'd expect. Switch adapters with{' '}
            <C>--adapter</C>, scope writes into a fork with <C>--fork</C>, get
            JSON when piped.
          </p>
        </div>
        <CodeBlock filename="~  shell" snippets={SNIPPETS.cli} />
        <div style={{ marginTop: 18, display: 'flex', gap: 24 }}>
          <a className="feature-link" href="/cli">
            CLI reference
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
