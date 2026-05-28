import { Note, P } from './Prose';

interface Props {
  eyebrow: string;
  title: string;
  blurb: string;
}

/**
 * Placeholder used by API / Adapters / CLI pages until their content
 * is written. Same shell as the real docs pages — sidebar, scroll-spy,
 * on-this-page rail — just with a "coming soon" callout in the main
 * column.
 */
export default function StubPage({ eyebrow, title, blurb }: Props) {
  return (
    <article className="docs-main">
      <div className="docs-eyebrow">{eyebrow}</div>
      <h1 className="docs-h1">{title}</h1>
      <P>{blurb}</P>
      <Note>
        This page is a placeholder while the docs are being written. The sidebar
        on the left shows the structure that will be filled in.
      </Note>
    </article>
  );
}
