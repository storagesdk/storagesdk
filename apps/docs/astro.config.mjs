import mdx from '@astrojs/mdx';
import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://storagesdk.dev',
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
