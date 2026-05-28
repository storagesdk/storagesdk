# @storagesdk/docs-site

The marketing + docs site for [storagesdk.dev](https://storagesdk.dev). Astro static build, React islands for interactive bits, served by Caddy on Fly.io.

## Local development

From the repo root:

```sh
pnpm --filter @storagesdk/docs-site dev
```

Astro prints a local URL (default `http://localhost:4321`). Hot-reloads on edits.

Other scripts (also via `pnpm --filter @storagesdk/docs-site …`):

- `build` — Astro static build into `apps/docs/dist/`.
- `preview` — serve the built `dist/` locally to sanity-check the production output.
- `check` — type-check Astro + React.

## Deployment (Fly.io)

The Fly config is split:

- [`../../fly.toml`](../../fly.toml) at the repo root — so Fly's build context is the whole monorepo and the Docker build can use the workspace's `pnpm-lock.yaml`.
- [`Dockerfile`](./Dockerfile) and [`Caddyfile`](./Caddyfile) live next to the app.

Deploy from the repo root:

```sh
fly deploy
```

## Where things live

```
apps/docs/
├── astro.config.mjs
├── package.json
├── tsconfig.json
├── Dockerfile, Caddyfile, fly.toml   # deploy config
├── public/
│   └── fonts/                        # self-hosted Geist variable webfonts
└── src/
    ├── pages/                        # one .astro file per route
    ├── layouts/Base.astro
    ├── components/
    │   ├── *.tsx                     # landing-page React islands
    │   └── docs/                     # docs-shell + section pages
    ├── data/
    │   ├── snippets.ts               # copy-paste code samples
    │   └── adapters.ts               # canonical adapter order + labels
    ├── lib/
    │   ├── sections.ts               # per-section sidebar config
    │   ├── scrollSpy.ts              # shared scroll-spy hook
    │   └── theme.ts                  # dark/light persistence
    └── styles/global.css             # all of it
```
