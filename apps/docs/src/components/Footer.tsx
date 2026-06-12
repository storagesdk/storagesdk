import { GithubIcon } from './Icon';

export default function Footer() {
  return (
    <footer className="footer">
      <div className="shell">
        <div className="footer-grid">
          <div className="footer-col">
            <a className="brand" href="/">
              <span className="brand-mark" aria-hidden="true" />
              <span>storagesdk.dev</span>
            </a>
            <p className="footer-blurb">Storage for humans and agents</p>
          </div>
          <div className="footer-col">
            <h5>Docs</h5>
            <ul>
              <li>
                <a href="/get-started">Get Started</a>
              </li>
              <li>
                <a href="/api">API reference</a>
              </li>
              <li>
                <a href="/adapters">Adapters</a>
              </li>
              <li>
                <a href="/cli">CLI</a>
              </li>
              <li>
                <a href="/ai">AI</a>
              </li>
            </ul>
          </div>
          <div className="footer-col">
            <h5>Source</h5>
            <ul>
              <li>
                <a href="https://github.com/storagesdk/storagesdk">GitHub</a>
              </li>
              <li>
                <a href="https://github.com/storagesdk/storagesdk/issues">
                  Issues
                </a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 Tigris Data Inc · Apache 2.0</span>
          <div className="footer-social">
            <a
              className="icon-btn"
              href="https://github.com/storagesdk/storagesdk"
              aria-label="GitHub"
            >
              <GithubIcon />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
