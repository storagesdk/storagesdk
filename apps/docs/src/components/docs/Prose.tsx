import type { ReactNode } from 'react';

export function H2({ id, children }: { id: string; children: ReactNode }) {
  return <h2 id={id} className="docs-h2">{children}</h2>;
}

export function H3({ id, children }: { id: string; children: ReactNode }) {
  return <h3 id={id} className="docs-h3">{children}</h3>;
}

export function P({ children }: { children: ReactNode }) {
  return <p className="docs-p">{children}</p>;
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="docs-inline-code">{children}</code>;
}

export function Note({ children }: { children: ReactNode }) {
  return (
    <aside className="docs-note">
      <span className="docs-note-mark">note</span>
      <div>{children}</div>
    </aside>
  );
}
