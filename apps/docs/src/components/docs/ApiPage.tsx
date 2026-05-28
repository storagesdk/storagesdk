import DocsLayout from './DocsLayout';
import StubPage from './StubPage';

export default function ApiPage() {
  return (
    <DocsLayout section="api">
      <StubPage
        eyebrow="API"
        title="API reference."
        blurb="Every method, every option, every return type. The same shape on every adapter."
      />
    </DocsLayout>
  );
}
