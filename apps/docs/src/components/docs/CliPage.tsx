import DocsLayout from './DocsLayout';
import StubPage from './StubPage';

export default function CliPage() {
  return (
    <DocsLayout section="cli">
      <StubPage
        eyebrow="CLI"
        title="The same surface, from your shell."
        blurb="@storagesdk/cli wraps every method as a command. Pipe with stdin/stdout, switch adapters with --adapter, get JSON by default."
      />
    </DocsLayout>
  );
}
