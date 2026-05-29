import { useMemo } from 'react';
import { useScrollSpy } from '../../lib/scrollSpy';
import type { Section } from '../../lib/sections';

interface Props {
  section: Section;
  /** Current pathname — used when sidebar items have hrefs (page-based nav). */
  currentPath: string;
}

export default function DocsSidebar({ section, currentPath }: Props) {
  const items = section.sidebar.items;
  // Page-based nav when any item carries an explicit href. Otherwise
  // fall back to in-page anchors + scroll-spy.
  const pageBased = items.some((i) => i.href);

  // Stable reference so the scroll-spy effect doesn't tear down its
  // listener every render. Empty when page-based — the hook short-circuits.
  const ids = useMemo(
    () => (pageBased ? [] : items.map((i) => i.id)),
    [items, pageBased]
  );
  const scrollActive = useScrollSpy(ids);

  const isActive = (it: { id: string; href?: string }) =>
    pageBased ? it.href === currentPath : it.id === scrollActive;

  return (
    <aside className="docs-sidebar">
      <div className="docs-sidebar-inner">
        <div className="sb-group">
          <div className="sb-group-label">{section.sidebar.label}</div>
          <ul>
            {items.map((it) => (
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
      </div>
    </aside>
  );
}
