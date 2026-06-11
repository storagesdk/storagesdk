import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://storagesdk.dev',
  // Static-HTML redirects for pages that moved during the docs restructure.
  // Astro emits a small page per entry with a `<meta http-equiv="refresh">`
  // and `<link rel="canonical">` so search engines follow the move and
  // the destination anchor still resolves.
  redirects: {
    '/cli/adapters': '/cli#adapter-discovery',
    '/adapters/registry': '/adapters#runtime-adapter-selection',
    '/ai-tools': '/ai',
    '/ai-tools/vercel': '/ai/vercel',
    '/ai-tools/mastra': '/ai/mastra',
  },
  integrations: [react(), mdx()],
  markdown: {
    // Dual Shiki themes — light/dark variants share the same DOM and
    // are toggled via the inline `--shiki-{light,dark}` CSS variables
    // we wire up in global.css against `[data-theme]`.
    shikiConfig: {
      themes: {
        light: 'github-light',
        dark: 'github-dark-dimmed',
      },
    },
  },
  vite: {
    server: {
      fs: { strict: false },
    },
  },
});
