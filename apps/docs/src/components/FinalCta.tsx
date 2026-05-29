import { ArrowIcon, GithubIcon } from './Icon';

export default function FinalCta() {
  return (
    <section className="final-cta">
      <div className="shell">
        <h2>
          One SDK. <em>Snapshots and forks</em> on every provider.
        </h2>
        <p>
          Open source, Apache 2.0, ESM-only, Node 20+. Built by the Tigris team
          — for everyone.
        </p>
        <div className="cta-row">
          <a className="btn btn-primary" href="/get-started">
            Read the docs
            <ArrowIcon />
          </a>
          <a
            className="btn btn-ghost"
            href="https://github.com/storagesdk/storagesdk"
          >
            <GithubIcon />
            Star on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
