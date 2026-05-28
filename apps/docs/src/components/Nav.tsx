import { useEffect, useState } from 'react';
import { readTheme, type Theme, writeTheme } from '../lib/theme';
import { GithubIcon, MoonIcon, SunIcon } from './Icon';

interface NavProps {
  /** Section the current page belongs to — used to highlight the matching nav link. */
  current?: 'get-started' | 'api' | 'adapters' | 'cli';
}

const LINKS: {
  id: NonNullable<NavProps['current']>;
  label: string;
  href: string;
}[] = [
  { id: 'get-started', label: 'Get Started', href: '/get-started' },
  { id: 'api', label: 'API', href: '/api' },
  { id: 'adapters', label: 'Adapters', href: '/adapters' },
  // CLI page hidden from nav until the @storagesdk/cli package ships.
  // { id: 'cli', label: 'CLI', href: '/cli' },
];

export default function Nav({ current }: NavProps) {
  const [theme, setTheme] = useState<Theme>('dark');

  // Sync from <html data-theme> on mount (the inline script in <head>
  // already set the right value before first paint).
  useEffect(() => {
    setTheme(readTheme());
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
