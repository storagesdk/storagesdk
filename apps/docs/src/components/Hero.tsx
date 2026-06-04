import { useEffect, useState } from 'react';
import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon, GithubIcon } from './Icon';

const MGRS = ['npm', 'pnpm', 'bun', 'yarn'] as const;
const TICKER_WORDS = [
  'fork',
  'snapshot',
  'download',
  'upload',
  'storage',
] as const;
const TICKER_INTERVAL_MS = 2000;

export default function Hero() {
  const [tickerIndex, setTickerIndex] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setTickerIndex((i) => (i + 1) % TICKER_WORDS.length);
    }, TICKER_INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

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
          Universal API for{' '}
          <span className="ticker">
            <em
              key={TICKER_WORDS[tickerIndex]}
              className="ticker-word"
              aria-live="polite"
            >
              {TICKER_WORDS[tickerIndex]}
            </em>
          </span>
        </h1>
        <p className="subhead">
          A unified TypeScript SDK for storage with first-class support for
          snapshotting, forking across many storage providers.
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
