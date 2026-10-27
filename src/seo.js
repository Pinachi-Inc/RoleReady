// Search engine hints for a single-page app that serves index.html on every path.
// Known pages get a canonical URL without query strings (ad links add utm_, fbclid and the like),
// so Google keeps one copy of each page. Any other path is a "page not found" for search,
// so it gets noindex instead of being indexed as a copy of the landing page.

const SITE = 'https://roleberry.app';

export function applySeoTags(path, knownPaths) {
  const head = document.head;
  if (knownPaths.includes(path)) {
    let link = head.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'canonical';
      head.appendChild(link);
    }
    link.href = path === '/' ? `${SITE}/` : `${SITE}${path}`;
  } else {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex';
    head.appendChild(meta);
  }
}
