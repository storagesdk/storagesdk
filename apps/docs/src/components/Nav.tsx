import { useEffect, useState } from 'react';
import { readTheme, type Theme, writeTheme } from '../lib/theme';
import { GithubIcon, MoonIcon, SunIcon } from './Icon';

type Section = 'get-started' | 'api' | 'adapters' | 'cli';

interface NavProps {
  /** Optional initial section — used during SSR so the right link is
   *  highlighted before client hydration runs. */
  current?: Section;
}

const LINKS: { id: Section; label: string; href: string }[] = [
  { id: 'get-started', label: 'Get Started', href: '/get-started' },
  { id: 'api', label: 'API', href: '/api' },
  { id: 'adapters', label: 'Adapters', href: '/adapters' },
  // CLI page hidden from nav until the @storagesdk/cli package ships.
  // { id: 'cli', label: 'CLI', href: '/cli' },
];

function deriveSection(pathname: string): Section | undefined {
  if (pathname.startsWith('/get-started')) return 'get-started';
  if (pathname.startsWith('/api')) return 'api';
  if (pathname.startsWith('/adapters')) return 'adapters';
  if (pathname.startsWith('/cli')) return 'cli';
  return undefined;
}

export default function Nav({ current: ssrCurrent }: NavProps) {
  const [theme, setTheme] = useState<Theme>('dark');
  // Derived from `location.pathname` so the highlighted link updates
  // across Astro view transitions even when the Nav island is
  // `transition:persist`-ed (the SSR prop wouldn't re-apply).
  const [current, setCurrent] = useState<Section | undefined>(ssrCurrent);

  useEffect(() => {
    setTheme(readTheme());
    const sync = () => setCurrent(deriveSection(window.location.pathname));
    sync();
    document.addEventListener('astro:after-swap', sync);
    return () => document.removeEventListener('astro:after-swap', sync);
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    writeTheme(next);
    setTheme(next);
  };

  return (
    <nav className="nav">
      <div className="shell nav-inner">
        <a className="brand" href="/">
          <span className="brand-mark" aria-hidden="true" />
          <span>
            storagesdk<span style={{ color: 'var(--fg-muted)' }}>.dev</span>
          </span>
        </a>
        <div className="nav-links">
          {LINKS.map((l) => (
            <a
              key={l.id}
              href={l.href}
              style={current === l.id ? { color: 'var(--fg)' } : undefined}
            >
              {l.label}
            </a>
          ))}
        </div>
        <div className="nav-right">
          <button
            type="button"
            className="icon-btn theme-toggle"
            onClick={toggle}
            aria-label="Toggle theme"
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          <a
            className="icon-btn"
            href="https://github.com/storagesdk/storagesdk"
            aria-label="GitHub"
          >
            <GithubIcon />
          </a>
        </div>
      </div>
    </nav>
  );
}
