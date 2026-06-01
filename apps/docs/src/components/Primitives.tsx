import { SNIPPETS } from '../data/snippets';
import CodeBlock from './CodeBlock';

export default function Primitives() {
  return (
    <section className="section primitives" id="snapshots">
      <div className="shell">
        <div className="primitives-head">
          <h2>
            Two primitives <em>nobody else</em> has.
          </h2>
          <p className="lead">
            Cross-provider storage SDKs stop at upload, download, list, delete.
            We don't. Snapshot and fork sit in the core surface — native on
            Tigris, emulated as sibling buckets everywhere else. Same call site
            either way.
          </p>
        </div>

        <div className="agent-note">
          <span className="agent-note-mark">Built for agents</span>
          <div className="agent-note-body">
            <b>Forks are sandboxes for your agents.</b> Branch a bucket per run;
            let the agent upload, mutate, and delete freely; merge or throw the
            fork away when it's done. Snapshots make every run{' '}
            <b>reproducible</b> — start the next agent from the same frozen
            state.
          </div>
        </div>

        <div className="primitive-card">
          <div>
            <div className="ptag">snapshots</div>
            <h3>Freeze a bucket. Read it forever.</h3>
            <p>
              Point-in-time snapshot of a bucket. Live writes keep going on the
              parent; the snapshot stays exactly as it was, readable through the
              same Storage API.
            </p>
          </div>
          <CodeBlock
            filename="snapshots.ts"
            snippets={SNIPPETS.snapshotsRead}
          />
        </div>

        <div className="primitive-card" id="forks">
          <div>
            <div className="ptag">forks</div>
            <h3>Branch a bucket. Mutate without fear.</h3>
            <p>
              Fork from a snapshot or from a bucket's live state. Every write
              lands in the fork's namespace; the parent is untouched. Throw it
              away when you're done.
            </p>
          </div>
          <CodeBlock filename="forks.ts" snippets={SNIPPETS.forksBranch} />
        </div>

        <div className="support-note">
          <span className="support-note-dot" aria-hidden="true" />
          <span>
            <b>Native on Tigris and GitHub.</b> Emulated as sibling buckets on
            S3, R2, GCS and others.
          </span>
        </div>
      </div>
    </section>
  );
}
