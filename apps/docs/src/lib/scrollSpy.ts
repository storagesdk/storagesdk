import { useEffect, useState } from 'react';

/**
 * Track which DOM element (looked up by id) is currently the user's
 * focus while scrolling. Returns the id of the element whose top has
 * passed below the viewport-top offset and is closest to it.
 *
 * Used by both the left docs sidebar (ids come from `SECTIONS`) and
 * the right-rail "on this page" (ids scraped from rendered headings).
 */
export function useScrollSpy(ids: string[], topOffset = 100): string {
  const [active, setActive] = useState(ids[0] ?? '');

  useEffect(() => {
    if (ids.length === 0) return;
    const onScroll = () => {
      // At page bottom the last heading can't physically scroll past the
      // top offset, so the normal loop would stick on the previous one.
      if (
        window.innerHeight + window.scrollY >=
        document.documentElement.scrollHeight - 4
      ) {
        // If the user navigated via an anchor that lives near the bottom
        // (and the browser couldn't scroll it to viewport top), honor
        // the hash — that's the section they asked for.
        const hashId = window.location.hash.slice(1);
        if (hashId && ids.includes(hashId)) {
          setActive(hashId);
          return;
        }
        setActive(ids[ids.length - 1] ?? '');
        return;
      }
      let best = ids[0] ?? '';
      let bestDelta = Number.POSITIVE_INFINITY;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        const top = el.getBoundingClientRect().top - topOffset;
        if (top <= 0 && Math.abs(top) < bestDelta) {
          best = id;
          bestDelta = Math.abs(top);
        }
      }
      setActive(best);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [ids, topOffset]);

  return active;
}
