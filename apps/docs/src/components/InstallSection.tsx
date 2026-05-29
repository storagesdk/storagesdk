import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';

const MGRS = ['npm', 'pnpm', 'bun', 'yarn'] as const;

export default function InstallSection() {
  return (
    <section className="section" id="install">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">install</div>
          <h2>From zero to upload in a minute.</h2>
          <p className="lead">
            Install core plus the adapters bundle, pick a provider, construct a
            Storage, and call it. The local filesystem adapter has no peer deps
            — run it in tests today.
          </p>
        </div>
        <div className="install-grid">
          <div className="step">
            <div>
              <div className="step-num">01</div>
              <h4>Install the packages</h4>
              <p>
                <code
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92em' }}
                >
                  @storagesdk/core
                </code>{' '}
                is the runtime;{' '}
                <code
                  style={{ fontFamily: 'var(--font-mono)', fontSize: '0.92em' }}
                >
                  @storagesdk/adapters
                </code>{' '}
                ships the first-party providers. Each native SDK is an optional
                peer dependency.
              </p>
            </div>
            <CodeBlock
              tabs={[...MGRS]}
              snippets={MGRS.map((m) => SNIPPETS.install[m])}
              copyable
            />
          </div>
          <div className="step">
            <div>
              <div className="step-num">02</div>
              <h4>Make your first call</h4>
              <p>
                The filesystem adapter is the fastest way to try the surface —
                no credentials, no network. Swap the import to switch providers.
              </p>
            </div>
            <CodeBlock filename="index.ts" snippets={SNIPPETS.firstCall} />
          </div>
        </div>
      </div>
    </section>
  );
}
