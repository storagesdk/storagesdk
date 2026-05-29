// Per-section sidebar config. Each docs page sets `current` on its
// `<DocsLayout>` to look up the matching entry and render the sidebar.
// The right-rail TOC is built from the live DOM headings.

export type SectionId = 'get-started' | 'api' | 'adapters' | 'cli';

interface SidebarItem {
  /** DOM id of the heading this entry jumps to. */
  id: string;
  label: string;
  /** Pill rendered next to the label (e.g. `native`). */
  badge?: string;
}

export interface Section {
  id: SectionId;
  label: string;
  href: string;
  sidebar: {
    label: string;
    items: SidebarItem[];
  };
}

export const SECTIONS: Record<SectionId, Section> = {
  'get-started': {
    id: 'get-started',
    label: 'Get Started',
    href: '/get-started',
    sidebar: {
      label: 'Get Started',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'installation', label: 'Installation' },
        { id: 'usage', label: 'Usage' },
        { id: 'adapter', label: 'Adapter' },
      ],
    },
  },
  api: {
    id: 'api',
    label: 'API',
    href: '/api',
    sidebar: {
      label: 'API',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'upload', label: 'upload()' },
        { id: 'download', label: 'download()' },
        { id: 'head', label: 'head()' },
        { id: 'list', label: 'list()' },
        { id: 'copy', label: 'copy()' },
        { id: 'move', label: 'move()' },
        { id: 'delete', label: 'delete()' },
        { id: 'url', label: 'url()' },
        { id: 'upload-url', label: 'uploadUrl()' },
        { id: 'snapshots', label: 'snapshots.*' },
        { id: 'forks', label: 'forks.*' },
      ],
    },
  },
  adapters: {
    id: 'adapters',
    label: 'Adapters',
    href: '/adapters',
    sidebar: {
      label: 'Adapters',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'tigris', label: 'Tigris', badge: 'native' },
        { id: 's3', label: 'Amazon S3' },
        { id: 'r2', label: 'Cloudflare R2' },
        { id: 'gcs', label: 'Google Cloud Storage' },
        { id: 'azure', label: 'Azure Blob' },
        { id: 'vercel', label: 'Vercel Blob' },
        { id: 'minio', label: 'MinIO' },
        { id: 'fly', label: 'Fly.io', badge: 'native' },
        { id: 'railway', label: 'Railway', badge: 'native' },
        { id: 'fs', label: 'Filesystem' },
        { id: 'byo', label: 'Bring your own' },
      ],
    },
  },
  cli: {
    id: 'cli',
    label: 'CLI',
    href: '/cli',
    sidebar: {
      label: 'CLI',
      items: [
        { id: 'overview', label: 'Overview' },
        { id: 'install', label: 'Install' },
        { id: 'auth', label: 'Authentication' },
        { id: 'commands', label: 'Commands' },
        { id: 'pipes', label: 'Pipes & stdin/stdout' },
      ],
    },
  },
};
