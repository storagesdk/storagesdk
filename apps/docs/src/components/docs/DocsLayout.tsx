import type { ReactNode } from 'react';
import { useScrollSpy } from '../../lib/scrollSpy';
import { SECTIONS, type SectionId } from '../../lib/sections';
import Nav from '../Nav';
import DocsSidebar from './DocsSidebar';
import OnThisPage from './OnThisPage';

interface Props {
  /** Which docs section the page belongs to. */
  section: SectionId;
  /** Article body — the section-specific page component. */
  children: ReactNode;
}

/**
 * Docs shell: top nav, sticky left sidebar (config-driven from
 * `SECTIONS[section]`), main article column, and a right-rail "on
 * this page" TOC (DOM-driven from rendered headings).
 *
 * Lives as a single React tree so scroll-spy can share state. Pages
 * pass the article body as children.
 */
export default function DocsLayout({ section, children }: Props) {
  const cfg = SECTIONS[section];
  const sidebarActive = useScrollSpy(cfg.sidebar.items.map((i) => i.id));

  return (
    <>
      <Nav current={section} />
      <div className="docs-layout">
        <DocsSidebar section={cfg} active={sidebarActive} />
        {children}
        <OnThisPage />
      </div>
    </>
  );
}
