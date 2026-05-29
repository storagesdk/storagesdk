import { useEffect, useState } from 'react';

const FOLD = 100;

/**
 * Scroll-spy. Returns the id of the heading the reader is currently on.
 *
 * Walks the heading ids in document order and picks the last one whose
 * top has crossed the `FOLD` line below the viewport top. On long pages
 * with short final sections, the last few headings can't actually be
 * scrolled past the fold (the page runs out of scroll first) — in that
 * case we switch to "closest to the fold" so every section still gets
 * a turn while the user scrolls toward the bottom.
 *
 * Three edge cases handled explicitly:
 *
 * 1. Initial render with a URL hash — seed the active state from
 *    `location.hash` so deep links highlight correctly.
 * 2. Exact document end — snap to the last id (or honor a URL hash if
 *    one is set, for short-page anchor deep links).
 * 3. `hashchange` — re-run the picker so clicks visibly take effect.
 */
export function useScrollSpy(ids: string[]): string {
  const [active, setActive] = useState(() => {
    if (typeof window === 'undefined') return ids[0] ?? '';
    const hashId = window.location.hash.slice(1);
    return hashId && ids.includes(hashId) ? hashId : (ids[0] ?? '');
  });

  useEffect(() => {
    if (ids.length === 0) return;

    const update = () => {
      const docH = document.documentElement.scrollHeight;
      const vh = window.innerHeight;
      const scrollY = window.scrollY;
      const maxScroll = docH - vh;
      const atExactBottom = scrollY + vh >= docH - 4;

      // 1. Exact bottom: snap to last id, or honor URL hash (deep-link
      //    into a short page where the anchor target can't be scrolled
      //    to the fold line).
      if (atExactBottom) {
        const hashId = window.location.hash.slice(1);
        if (hashId && ids.includes(hashId)) {
          setActive(hashId);
          return;
        }
        setActive(ids[ids.length - 1] ?? '');
        return;
      }

      // 2. Find the last heading whose top has crossed the fold.
      let passedIdx = -1;
      for (let i = 0; i < ids.length; i++) {
        const el = document.getElementById(ids[i]);
        if (!el) continue;
        const top = el.getBoundingClientRect().top;
        if (top <= FOLD) {
          passedIdx = i;
        } else {
          break;
        }
      }

      // 3. If the next heading can't be reached by scrolling further,
      //    pick the heading whose top is closest to the fold (= the
      //    section the user is visually most focused on as they
      //    approach the bottom). Otherwise the user would see the
      //    middle headings skipped as the page snaps from "last
      //    passed" to the bottom override.
      if (passedIdx + 1 < ids.length) {
        const nextEl = document.getElementById(ids[passedIdx + 1]);
        if (nextEl) {
          const nextDocY = nextEl.getBoundingClientRect().top + scrollY;
          if (nextDocY - FOLD > maxScroll) {
            let best = passedIdx >= 0 ? ids[passedIdx] : (ids[0] ?? '');
            let bestDist = Number.POSITIVE_INFINITY;
            const startIdx = Math.max(0, passedIdx);
            for (let i = startIdx; i < ids.length; i++) {
              const el = document.getElementById(ids[i]);
              if (!el) continue;
              const dist = Math.abs(el.getBoundingClientRect().top - FOLD);
              if (dist < bestDist) {
                best = ids[i];
                bestDist = dist;
              }
            }
            setActive(best);
            return;
          }
        }
      }

      // 4. Normal case: last passed heading wins.
      setActive(passedIdx >= 0 ? ids[passedIdx] : (ids[0] ?? ''));
    };

    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    window.addEventListener('hashchange', update);

    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
      window.removeEventListener('hashchange', update);
    };
  }, [ids]);

  return active;
}
