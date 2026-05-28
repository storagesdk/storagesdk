import { glob } from 'astro/loaders';
import { defineCollection } from 'astro:content';
import { z } from 'astro:schema';

// Docs collection. One MDX file per route under `src/content/docs/`.
// The `id` (filename without `.mdx`) matches the route segment in
// `src/pages/*.astro` (e.g. `get-started.mdx` ↔ `/get-started`).
const docs = defineCollection({
  loader: glob({ pattern: '**/*.mdx', base: './src/content/docs' }),
  schema: z.object({
    /** Page title — used in <title>, the article h1, and the OG meta. */
    title: z.string(),
    /** Short eyebrow line above the h1 (e.g. "Get Started"). */
    eyebrow: z.string(),
    /** SEO description. */
    description: z.string(),
    /** Which section the page belongs to (drives nav highlight + sidebar). */
    section: z.enum(['get-started', 'api', 'adapters', 'cli']),
    /** Optional next-page pager link. */
    next: z
      .object({
        href: z.string(),
        title: z.string(),
      })
      .optional(),
  }),
});

export const collections = { docs };
