# @storagesdk/motion

[Remotion](https://www.remotion.dev/) animations for storagesdk — a single
~66s walkthrough that installs the SDK, writes against the Tigris adapter,
swaps adapters without touching the method calls, runs list/upload/delete
against a live object browser, and finishes on two fuller scenes for Tigris
snapshots and forks.

Every line of code shown in the editor is real API: `new Storage({ adapter })`,
the per-adapter config shapes, `storage.list/upload/delete`, and
`storage.snapshots.*` / `storage.forks.*`.

## The walkthrough

| # | Scene | What it shows |
| --- | --- | --- |
| 1 | Install | The terminal types `npm install @storagesdk/core @storagesdk/adapters` |
| 2 | Write | Import the Tigris adapter, then `list`, `upload`, `delete` |
| 3 | Swap | The import cross-dissolves S3 → Azure → GitHub; the method calls stay pinned and unchanged |
| 4 | List | `list()` runs; objects stream into the browser |
| 5 | Upload | `upload()` runs; the new object pops in with a NEW badge |
| 6 | Delete | `delete()` runs; the object is struck through and removed |
| 7 | Snapshots | Write → snapshot → overwrite, then read both: the snapshot still returns the frozen bytes |
| 8 | Forks | Snapshot → fork → write into the fork; a branch graph + parent-vs-fork reads show the parent untouched |

Pacing lives in `SCENES` (durations) in `src/Main.tsx` and in the per-scene
typing/step constants — tune those to speed up or slow down any beat.

## Formats

Landscape (1920×1080) is the only composition registered right now — it's the
landing-page hero we're locking first. The scenes already lay out responsively
via `useLayout()`, so the Square (1:1) and Vertical (9:16) compositions are a
quick re-enable in `src/Root.tsx` once the landscape cut is final.

| Composition | Size | Use |
| --- | --- | --- |
| `Landscape` | 1920×1080 | Landing page, YouTube, docs/README embeds |
| `Square` _(off)_ | 1080×1080 | LinkedIn / X feed — re-enable in `Root.tsx` |
| `Vertical` _(off)_ | 1080×1920 | Reels / Shorts / TikTok — re-enable in `Root.tsx` |

## Develop

```sh
pnpm --filter @storagesdk/motion studio   # open Remotion Studio
```

Scrub the timeline, tweak a scene under `src/scenes/`, and the preview updates
live. Per-scene durations and the order live in `SCENES` in `src/Main.tsx`.

## Render

```sh
pnpm --filter @storagesdk/motion render    # → out/storagesdk-16x9.mp4
pnpm --filter @storagesdk/motion still     # poster PNG from frame 120
```

Output lands in `out/` (gitignored). The first render downloads a headless
browser; later renders reuse it.

## Layout

```
src/
  Root.tsx          three Compositions (Landscape / Square / Vertical)
  Main.tsx          the master timeline (TransitionSeries) + per-scene durations
  theme.ts          Tigris-tinted palette, syntax colors, fonts
  scenes/           one file per step (1–8)
  components/        Workspace, Code, StoreBrowser, ForkGraph, window chrome…
  lib/
    snippets.ts     the exact code shown in the editor (verified against the API)
    highlight.ts    the small TS tokenizer the editor renders
    layout.ts       responsive layout derived from each composition's size
    timing.ts       easing / ramp / typing helpers
```

> This package is render-only and isn't published — it has no `build` step and
> stays out of the SDK's release pipeline.
