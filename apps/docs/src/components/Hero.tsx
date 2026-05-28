import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon, GithubIcon } from './Icon';

const MGRS = ['npm', 'pnpm', 'bun', 'yarn'] as const;

export default function Hero() {
  return (
    <section className="hero">
      <div className="hero-grid" aria-hidden="true" />
      <div className="shell hero-inner">
        <a className="eyebrow" href="https://github.com/storagesdk/storagesdk">
          <span className="eyebrow-tag">v0.x</span>
          <span>Multi-provider · Apache 2.0 · Node 20+</span>
          <span className="eyebrow-arrow">→</span>
        </a>
        <h1 className="headline">
          Storage for <em>agents</em>.
        </h1>
        <p className="subhead">
          A multi-provider TypeScript SDK with{' '}
          <b style={{ color: 'var(--fg)', fontWeight: 600 }}>fork</b> and{' '}
          <b style={{ color: 'var(--fg)', fontWeight: 600 }}>snapshot</b> as
          primitives. Branch a bucket per agent run; freeze a moment in time and
          replay it deterministically. The same API across Amazon S3, Cloudflare
          R2, Tigris, GCS, Azure Blob, Vercel Blob, MinIO, and your filesystem.
        </p>

        <div className="hero-install">
          <CodeBlock
            tabs={[...MGRS]}
            snippets={MGRS.map((m) => SNIPPETS.install[m])}
            copyable
          />
        </div>

        <div className="cta-row">
          <a className="btn btn-primary" href="/get-started">
            Get started
            <ArrowIcon />
          </a>
          <a
            className="btn btn-ghost"
            href="https://github.com/storagesdk/storagesdk"
          >
            <GithubIcon />
            github.com/storagesdk
          </a>
        </div>
      </div>
    </section>
  );
}
