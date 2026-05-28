const FEATURES = [
  {
    tag: 'streaming',
    title: 'Web streams, in and out',
    body: 'ReadableStream<Uint8Array> downloads; web streams accepted on upload. Backpressure and abort propagate end-to-end.',
  },
  {
    tag: 'signed urls',
    title: 'PUT or POST, your call',
    body: 'Presigned PUT by default; POST with maxSize / contentType when the backend should enforce the bounds.',
  },
  {
    tag: 'escape hatch',
    title: 'storage.raw, fully typed',
    body: 'Reach through to the native client for adapter-specific features. Inferred — no casts, no any.',
  },
  {
    tag: 'abort',
    title: 'AbortSignal on every op',
    body: "Cancel uploads, list scans, snapshots. Writes don't commit if interrupted.",
  },
  {
    tag: 'errors',
    title: 'Typed StorageError codes',
    body: 'NotFound, Conflict, Aborted, NotSupported… switch on code, stay portable across adapters.',
  },
  {
    tag: 'ergonomics',
    title: 'ESM-only, Node 20+',
    body: 'Zero runtime deps in core. Each adapter brings its native SDK as an optional peer.',
  },
];

export default function Features() {
  return (
    <section className="section" id="features">
      <div className="shell">
        <div className="section-head">
          <div className="section-eyebrow">features</div>
          <h2>More than the CRUD basics.</h2>
          <p className="lead">
            The same shape on every adapter — with the modern primitives you
            expect.
          </p>
        </div>
        <ul className="feature-bullets">
          {FEATURES.map((it) => (
            <li key={it.tag}>
              <div className="feature-bullet-tag">{it.tag}</div>
              <div className="feature-bullet-title">{it.title}</div>
              <div className="feature-bullet-body">{it.body}</div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
