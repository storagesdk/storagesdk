import { useEffect, useMemo, useState } from 'react';
import { useScrollSpy } from '../../lib/scrollSpy';

interface Heading {
  id: string;
  text: string;
  level: 2 | 3;
}

/**
 * Right-rail "on this page" TOC. Scans the rendered article for
 * `h2[id]` and `h3[id]` after mount, then runs scroll-spy across them.
 *
 * Lives in the layout's 3rd grid column at ≥1180px; hidden by CSS
 * below that breakpoint.
 */
export default function OnThisPage() {
  const [headings, setHeadings] = useState<Heading[]>([]);

  useEffect(() => {
    const article = document.querySelector('article.docs-main');
    if (!article) return;
    const found: Heading[] = [];
    for (const el of article.querySelectorAll<HTMLHeadingElement>(
      'h2[id], h3[id]'
    )) {
      const level = el.tagName === 'H2' ? 2 : 3;
      found.push({ id: el.id, text: el.textContent ?? '', level });
    }
    setHeadings(found);
  }, []);

  // Stable reference so the scroll-spy effect doesn't tear down its
  // listener every time `setActive` re-renders the component.
  const ids = useMemo(() => headings.map((h) => h.id), [headings]);
  const active = useScrollSpy(ids);

  if (headings.length === 0) return null;

  return (
    <aside className="docs-toc">
      <div className="docs-toc-label">On this page</div>
      <ul>
        {headings.map((h) => (
          <li key={h.id}>
            <a
              href={`#${h.id}`}
              className={
                'sb-link' +
                (h.level === 3 ? ' sb-link-h3' : '') +
                (h.id === active ? ' is-active' : '')
              }
            >
              {h.text}
            </a>
          </li>
        ))}
      </ul>
    </aside>
  );
}
