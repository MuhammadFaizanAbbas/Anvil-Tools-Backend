// Canonical public header and footer shared by generated pages and server renderers.
function href(base, pathname) {
  return `${String(base || '').replace(/\/$/, '')}${pathname}`;
}

function currentSection(pathname) {
  const path = String(pathname || '/').split(/[?#]/)[0];
  if (path === '/' || path === '/index.html') return 'home';
  if (/^\/(?:tools|categories)\//.test(path)) return 'tools';
  if (/^\/(?:blog|journal|lab)(?:\/|$)/.test(path)) return 'guides';
  if (path === '/about.html' || path === '/editorial-policy.html') return 'about';
  if (path === '/contact.html') return 'contact';
  return '';
}

function canonicalHeader(pathname = '/', base = '') {
  const current = currentSection(pathname);
  const link = (section, target, label) => `<a href="${href(base, target)}"${current === section ? ' aria-current="page"' : ''}>${label}</a>`;
  return `<header class="site-header">
  <div class="header-row">
    <a class="logo" href="${href(base, '/')}">
      <img class="brand-mark" src="${href(base, '/assets/images/anvil-mark.svg')}" width="36" height="36" alt="">
      Anvil Tools
    </a>
    <button class="nav-toggle" aria-label="Toggle navigation" aria-expanded="false" aria-controls="main-navigation"><span aria-hidden="true">&#9776;</span></button>
    <nav class="main-nav" id="main-navigation">${link('home', '/', 'Home')}${link('tools', '/tools/index.html', 'All tools')}${link('guides', '/blog/index.html', 'Guides &amp; experiments')}${link('about', '/about.html', 'About')}${link('contact', '/contact.html', 'Contact')}</nav>
  </div>
</header>`;
}

function canonicalFooter(base = '') {
  return `<footer class="site-footer">
  <div class="wrap">
    <div class="footer-grid">
      <div>
        <div class="logo" style="margin-bottom:10px;"><img class="brand-mark" src="${href(base, '/assets/images/anvil-mark.svg')}" width="36" height="36" alt="">Anvil Tools</div>
        <p class="small-note">Free, browser-based tools for email, images, PDFs, and everyday developer tasks. No installs, no accounts required for most tools.</p>
      </div>
      <div>
        <h3>Tools</h3>
        <ul>
          <li><a href="${href(base, '/tools/temp-mail.html')}">Temp mail</a></li>
          <li><a href="${href(base, '/tools/background-remover.html')}">Background remover</a></li>
          <li><a href="${href(base, '/tools/pdf-merge.html')}">PDF merge</a></li>
          <li><a href="${href(base, '/tools/index.html')}">View all tools</a></li>
        </ul>
      </div>
      <div>
        <h3>Company</h3>
        <ul>
          <li><a href="${href(base, '/about.html')}">About</a></li>
          <li><a href="${href(base, '/editorial-policy.html')}">Editorial policy</a></li>
          <li><a href="${href(base, '/lab/index.html')}">Anvil Tools Lab</a></li>
          <li><a href="${href(base, '/blog/index.html')}">Guides &amp; experiments</a></li>
          <li><a href="${href(base, '/contact.html')}">Contact</a></li>
        </ul>
      </div>
      <div>
        <h3>Legal</h3>
        <ul>
          <li><a href="${href(base, '/privacy-policy.html')}">Privacy policy</a></li>
          <li><a href="${href(base, '/terms-of-service.html')}">Terms of service</a></li>
          <li><a href="${href(base, '/cookie-policy.html')}">Cookie policy</a></li>
          <li><a href="${href(base, '/disclaimer.html')}">Disclaimer</a></li>
        </ul>
      </div>
    </div>
    <div class="footer-bottom">
      <span>&copy; <span class="current-year">${new Date().getUTCFullYear()}</span> Anvil Tools. All rights reserved.</span>
      <span>Anvil Tools is a VelloxTech project.</span>
    </div>
  </div>
</footer>`;
}

function applyPublicChrome(html, pathname, base = '') {
  if (!/<header class="site-header">[\s\S]*?<\/header>/.test(html)) throw new Error(`Missing public header: ${pathname}`);
  if (!/<footer class="site-footer">[\s\S]*?<\/footer>/.test(html)) throw new Error(`Missing public footer: ${pathname}`);
  return html
    .replace(/<header class="site-header">[\s\S]*?<\/header>/, canonicalHeader(pathname, base))
    .replace(/<footer class="site-footer">[\s\S]*?<\/footer>/, canonicalFooter(base));
}

module.exports = { applyPublicChrome, canonicalFooter, canonicalHeader, currentSection };
