import { useMemo } from 'react';
import { useScrollSpy } from '../../lib/scrollSpy';
import type { Section } from '../../lib/sections';

interface Props {
  section: Section;
}

export default function DocsSidebar({ section }: Props) {
  // Stable reference so the scroll-spy effect doesn't tear down its
  // listener every time `setActive` re-renders the component.
  const ids = useMemo(() => section.sidebar.items.map((i) => i.id), [section]);
  const active = useScrollSpy(ids);
  return (
    <aside className="docs-sidebar">
      <div className="docs-sidebar-inner">
        <div className="sb-group">
          <div className="sb-group-label">{section.sidebar.label}</div>
          <ul>
            {section.sidebar.items.map((it) => (
              <li key={it.id}>
                <a
                  href={`#${it.id}`}
                  className={'sb-link' + (it.id === active ? ' is-active' : '')}
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
