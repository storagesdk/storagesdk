import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';

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
          <div className="section-eyebrow">cli · preview</div>
          <h2>The same surface, from your shell.</h2>
          <p className="lead">
            <C>@storagesdk/cli</C> wraps every method as a command. Pipe with
            stdin/stdout, switch adapters with <C>--adapter</C>, get JSON by
            default.
          </p>
        </div>
        <CodeBlock filename="~  shell" snippets={SNIPPETS.cli} />
      </div>
    </section>
  );
}
