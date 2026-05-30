import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

export default function CustomAdapterSection() {
  return (
    <section className="section">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">extensible</div>
          <h2>Write your own adapter.</h2>
          <p className="lead">
            Third-party adapters are first-class. Implement the contract, drop
            in the conformance test suite, ship a package. Use the adapter kit's
            helpers to emulate snapshots and forks via sibling buckets, or wire
            up your provider's native API directly.
          </p>
        </div>
        <CodeBlock filename="my-adapter.ts" snippets={SNIPPETS.customAdapter} />
        <div
          style={{ marginTop: 18, display: 'flex', gap: 24, flexWrap: 'wrap' }}
        >
          <a className="feature-link" href="/adapters">
            View all adapters
            <ArrowIcon />
          </a>
          <a
            className="feature-link"
            href="https://github.com/storagesdk/storagesdk/issues"
          >
            Request an adapter
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
