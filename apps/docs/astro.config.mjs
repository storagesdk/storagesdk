import react from '@astrojs/react';
import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://storagesdk.dev',
  integrations: [react()],
  vite: {
    server: {
      fs: { strict: false },
    },
  },
});
