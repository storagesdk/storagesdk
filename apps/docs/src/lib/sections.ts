// Per-section sidebar config. Each docs page sets `current` on its
// `<DocsLayout>` to look up the matching entry and render the sidebar.
// The right-rail TOC is built from the live DOM headings.

export type SectionId = 'get-started' | 'api' | 'adapters' | 'ai-tools' | 'cli';

interface SidebarItem {
  /** DOM id of the heading this entry jumps to (anchor-based nav), or
   *  a stable key to identify the item (page-based nav). */
  id: string;
  label: string;
  /** Pill rendered next to the label (e.g. `native`). */
  badge?: string;
  /** Full URL when the sidebar links to other pages instead of in-page
   *  anchors. When set, the active state matches by URL, not scroll. */
  href?: string;
}

export interface SidebarGroup {
  label: string;
  items: SidebarItem[];
}

export interface Section {
  id: SectionId;
  label: string;
  href: string;
  /** One or more sidebar groups. Sections with a single group render
   *  the group label once at the top; multi-group sections (e.g. CLI's
   *  "CLI" + "Commands") get a label per group. */
  sidebar: {
    groups: SidebarGroup[];
  };
}

export const SECTIONS: Record<SectionId, Section> = {
  'get-started': {
    id: 'get-started',
    label: 'Get Started',
    href: '/get-started',
    sidebar: {
      groups: [
        {
          label: 'Get Started',
          items: [
            { id: 'overview', label: 'Overview' },
            { id: 'installation', label: 'Installation' },
            { id: 'usage', label: 'Usage' },
            { id: 'adapter', label: 'Adapter' },
          ],
        },
      ],
    },
  },
  api: {
    id: 'api',
    label: 'API',
    href: '/api',
    sidebar: {
      groups: [
        {
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
            { id: 'snapshots', label: 'Snapshots' },
            { id: 'forks', label: 'Forks' },
          ],
        },
      ],
    },
  },
  adapters: {
    id: 'adapters',
    label: 'Adapters',
    href: '/adapters',
    sidebar: {
      groups: [
        {
          label: 'Adapters',
          items: [
            { id: 'overview', label: 'Overview', href: '/adapters' },
            {
              id: 'tigris',
              label: 'Tigris',
              badge: 'native',
              href: '/adapters/tigris',
            },
            { id: 's3', label: 'Amazon S3', href: '/adapters/s3' },
            { id: 'r2', label: 'Cloudflare R2', href: '/adapters/r2' },
            {
              id: 'gcs',
              label: 'Google Cloud Storage',
              href: '/adapters/gcs',
            },
            { id: 'azure', label: 'Azure Blob', href: '/adapters/azure' },
            { id: 'vercel', label: 'Vercel Blob', href: '/adapters/vercel' },
            { id: 'minio', label: 'MinIO', href: '/adapters/minio' },
            {
              id: 'backblaze',
              label: 'Backblaze B2',
              href: '/adapters/backblaze',
            },
            {
              id: 'spaces',
              label: 'DigitalOcean Spaces',
              href: '/adapters/spaces',
            },
            { id: 'wasabi', label: 'Wasabi', href: '/adapters/wasabi' },
            {
              id: 'supabase',
              label: 'Supabase Storage',
              href: '/adapters/supabase',
            },
            {
              id: 'linode',
              label: 'Linode Object Storage',
              href: '/adapters/linode',
            },
            {
              id: 'github',
              label: 'GitHub',
              badge: 'native',
              href: '/adapters/github',
            },
            { id: 'webdav', label: 'WebDAV', href: '/adapters/webdav' },
            { id: 'fly', label: 'Fly.io', href: '/adapters/fly' },
            { id: 'railway', label: 'Railway', href: '/adapters/railway' },
            { id: 'fs', label: 'Filesystem', href: '/adapters/fs' },
            {
              id: 'write-your-own',
              label: 'Write your own',
              href: '/adapters/write-your-own',
            },
          ],
        },
      ],
    },
  },
  'ai-tools': {
    id: 'ai-tools',
    label: 'AI tools',
    href: '/ai-tools',
    sidebar: {
      groups: [
        {
          label: 'AI tools',
          items: [
            { id: 'overview', label: 'Overview', href: '/ai-tools' },
            { id: 'vercel', label: 'Vercel AI SDK', href: '/ai-tools/vercel' },
            { id: 'mastra', label: 'Mastra', href: '/ai-tools/mastra' },
          ],
        },
      ],
    },
  },
  cli: {
    id: 'cli',
    label: 'CLI',
    href: '/cli',
    sidebar: {
      groups: [
        {
          label: 'CLI',
          items: [{ id: 'overview', label: 'Overview', href: '/cli' }],
        },
        {
          label: 'Commands',
          items: [
            { id: 'ls', label: 'ls', href: '/cli/ls' },
            { id: 'stat', label: 'stat', href: '/cli/stat' },
            { id: 'cat', label: 'cat', href: '/cli/cat' },
            { id: 'sign', label: 'sign', href: '/cli/sign' },
            { id: 'cp', label: 'cp', href: '/cli/cp' },
            { id: 'mv', label: 'mv', href: '/cli/mv' },
            { id: 'rm', label: 'rm', href: '/cli/rm' },
            { id: 'snapshots', label: 'snapshots', href: '/cli/snapshots' },
            { id: 'forks', label: 'forks', href: '/cli/forks' },
          ],
        },
        {
          label: 'Agents',
          items: [{ id: 'mcp', label: 'MCP Server', href: '/cli/mcp' }],
        },
      ],
    },
  },
};
