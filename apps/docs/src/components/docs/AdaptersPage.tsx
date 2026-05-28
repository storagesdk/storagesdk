import DocsLayout from './DocsLayout';
import StubPage from './StubPage';

export default function AdaptersPage() {
  return (
    <DocsLayout section="adapters">
      <StubPage
        eyebrow="Adapters"
        title="Pick a backend. Bring your own."
        blurb="Per-adapter config, auth, and gotchas. Snapshots and forks are native on Tigris and emulated as sibling buckets on every other backend."
      />
    </DocsLayout>
  );
}
