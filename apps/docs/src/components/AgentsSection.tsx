import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';
import { ArrowIcon } from './Icon';

export default function AgentsSection() {
  const C = ({ children }: { children: string }) => (
    <code
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: '0.92em',
        color: 'var(--fg)',
      }}
    >
      {children}
    </code>
  );
  return (
    <section className="section" id="agents">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">agents</div>
          <h2>Drop into any agent runtime.</h2>
          <p className="lead">
            Hand a <C>Storage</C> to the Vercel AI SDK or Mastra; or boot the
            MCP server for any host that speaks the protocol. Tool descriptions
            teach the model to snapshot before risky edits and fork to try
            variants — your undo and branching story comes baked in.
          </p>
        </div>
        <CodeBlock
          tabs={['Vercel AI SDK', 'Mastra', 'MCP server']}
          snippets={[
            SNIPPETS.agentsVercel,
            SNIPPETS.agentsMastra,
            SNIPPETS.agentsMcp,
          ]}
        />
        <div style={{ marginTop: 18, display: 'flex', gap: 24 }}>
          <a className="feature-link" href="/ai">
            AI integrations
            <ArrowIcon />
          </a>
          <a className="feature-link" href="/cli/mcp">
            MCP server reference
            <ArrowIcon />
          </a>
        </div>
      </div>
    </section>
  );
}
