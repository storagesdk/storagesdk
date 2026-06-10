import { useMemo } from 'react';
import { useScrollSpy } from '../../lib/scrollSpy';
import type { Section } from '../../lib/sections';

interface Props {
  section: Section;
  /** Current pathname — used when sidebar items have hrefs (page-based nav). */
  currentPath: string;
}

export default function DocsSidebar({ section, currentPath }: Props) {
  const groups = section.sidebar.groups;
  // Page-based nav when any item carries an explicit href. Otherwise
  // fall back to in-page anchors + scroll-spy.
  const pageBased = groups.some((g) => g.items.some((i) => i.href));

  // Flat ids list for the scroll-spy hook. Empty when page-based — the
  // hook short-circuits.
  const ids = useMemo(
    () => (pageBased ? [] : groups.flatMap((g) => g.items.map((i) => i.id))),
    [groups, pageBased]
  );
  const scrollActive = useScrollSpy(ids);

  // Normalize trailing slash so `/adapters/tigris` matches
  // `Astro.url.pathname === '/adapters/tigris/'` (Astro 6's default
  // `build.format: 'directory'`).
  const stripSlash = (p: string) =>
    p.length > 1 && p.endsWith('/') ? p.slice(0, -1) : p;
  const here = stripSlash(currentPath);
  const isActive = (it: { id: string; href?: string }) =>
    pageBased
      ? it.href !== undefined && stripSlash(it.href) === here
      : it.id === scrollActive;

  return (
    <aside className="docs-sidebar">
      <div className="docs-sidebar-inner">
        {groups.map((group) => (
          <div className="sb-group" key={group.label}>
            <div className="sb-group-label">{group.label}</div>
            <ul>
              {group.items.map((it) => (
                <li key={it.id}>
                  <a
                    href={it.href ?? `#${it.id}`}
                    className={`sb-link${isActive(it) ? ' is-active' : ''}`}
                  >
                    <span>{it.label}</span>
                    {it.badge ? (
                      <span className="sb-badge">{it.badge}</span>
                    ) : null}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
