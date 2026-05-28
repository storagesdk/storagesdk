import type { Section } from '../../lib/sections';

interface Props {
  section: Section;
  active: string;
}

export default function DocsSidebar({ section, active }: Props) {
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
                  {it.badge ? <span className="sb-badge">{it.badge}</span> : null}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </aside>
  );
}
