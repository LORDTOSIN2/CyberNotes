/**
 * HTML templates for every page type. Strings are assembled here so the build
 * script stays about data, not markup.
 */

import { escapeHtml, escapeAttr, formatDate } from './utils.mjs';

/** Join a path with the deployment base path ('' for root deployments). */
export function makeLinker(basePath) {
  const base = String(basePath ?? '').replace(/\/+$/, '');
  return (path) => {
    if (!path) return `${base}/`;
    if (/^(?:[a-z]+:)?\/\//i.test(path) || path.startsWith('mailto:') || path.startsWith('#')) return path;
    const suffix = path.startsWith('/') ? path : `/${path}`;
    return `${base}${suffix}`;
  };
}

export function absoluteUrl(baseUrl, basePath, path) {
  const root = String(baseUrl ?? '').replace(/\/+$/, '');
  const href = makeLinker(basePath)(path);
  if (/^https?:\/\//i.test(href)) return href;
  return `${root}${href}`;
}

const DIFFICULTY_LABELS = {
  beginner: 'Beginner',
  intermediate: 'Intermediate',
  advanced: 'Advanced',
  unrated: 'Unrated'
};

export function difficultyLabel(value) {
  return DIFFICULTY_LABELS[value] ?? 'Unrated';
}

/* ------------------------------------------------------------------ fragments */

export function tagChip(tag, link, options = {}) {
  const count = options.count;
  const className = ['tag-chip', options.className].filter(Boolean).join(' ');
  const countHtml = typeof count === 'number' ? `<span class="tag-chip__count">${count}</span>` : '';
  return `<a class="${className}" href="${escapeAttr(link(`/tags/${tag.slug}/`))}" data-tag="${escapeAttr(tag.slug)}">` +
    `<span class="tag-chip__hash" aria-hidden="true">#</span>${escapeHtml(tag.name)}${countHtml}</a>`;
}

export function difficultyBadge(level, link) {
  const label = difficultyLabel(level);
  const html = `<span class="diff diff--${escapeAttr(level)}"><span class="diff__dot" aria-hidden="true"></span>${escapeHtml(label)}</span>`;
  return link ? `<a class="diff-link" href="${escapeAttr(link(`/difficulty/${level}/`))}">${html}</a>` : html;
}

export function noteCard(note, link) {
  const tags = note.tags.slice(0, 5).map((tag) => tagChip(tag, link, { className: 'tag-chip--sm' })).join('');
  const more = note.tags.length > 5 ? `<span class="tag-chip tag-chip--sm tag-chip--more">+${note.tags.length - 5}</span>` : '';
  return [
    `<article class="note-card" data-note-card`,
    ` data-title="${escapeAttr(note.title.toLowerCase())}"`,
    ` data-summary="${escapeAttr((note.summary || '').toLowerCase())}"`,
    ` data-search="${escapeAttr(note.searchBlob)}"`,
    ` data-tags="${escapeAttr(note.tags.map((tag) => tag.slug).join(','))}"`,
    ` data-difficulty="${escapeAttr(note.difficulty)}"`,
    ` data-date="${escapeAttr(note.dateIso)}"`,
    ` data-reading="${note.readingTime}"`,
    ` data-index="${note.index}">`,
    '<div class="note-card__top">',
    `<a class="note-card__title" href="${escapeAttr(link(note.url))}">${escapeHtml(note.title)}</a>`,
    difficultyBadge(note.difficulty),
    '</div>',
    `<p class="note-card__summary">${escapeHtml(note.summary)}</p>`,
    `<div class="note-card__tags">${tags}${more}</div>`,
    '<div class="note-card__meta">',
    `<time datetime="${escapeAttr(note.dateIso)}">${escapeHtml(note.dateDisplay)}</time>`,
    `<span class="dot" aria-hidden="true">·</span><span>${note.readingTime} min read</span>`,
    `<span class="dot" aria-hidden="true">·</span><span class="note-card__file">${escapeHtml(note.file)}</span>`,
    '</div>',
    '</article>'
  ].join('');
}

/* --------------------------------------------------------------------- layout */

export function layout(page, site) {
  const { link, basePath, siteOrigin, config } = site;
  const origin = siteOrigin ?? config.url ?? '';
  const title = page.title ? `${page.title} · ${config.title}` : `${config.title} — ${config.tagline}`;
  const description = page.description || config.description;
  const canonical = page.canonical ? absoluteUrl(origin, basePath, page.canonical) : absoluteUrl(origin, basePath, '/');
  const bodyClass = page.bodyClass ? ` class="${escapeAttr(page.bodyClass)}"` : '';

  const navItems = config.nav.map((item) => {
    const href = link(item.href);
    const active = page.navKey && item.href.startsWith(`/${page.navKey}`);
    return `<a class="site-nav__link${active ? ' is-active' : ''}" href="${escapeAttr(href)}"${active ? ' aria-current="page"' : ''}>${escapeHtml(item.label)}</a>`;
  }).join('');

  const social = (config.social ?? []).map((item) =>
    `<a class="footer__link" href="${escapeAttr(/^https?:/.test(item.href) ? item.href : link(item.href))}">${escapeHtml(item.label)}</a>`).join('');

  return `<!doctype html>
<html lang="${escapeAttr(config.lang)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeAttr(description)}" />
<link rel="canonical" href="${escapeAttr(canonical)}" />
<meta name="site-base" content="${escapeAttr(basePath)}" />
<meta name="color-scheme" content="dark light" />
<meta name="theme-color" content="#0b1014" media="(prefers-color-scheme: dark)" />
<meta name="theme-color" content="#f6f8fa" media="(prefers-color-scheme: light)" />
<meta name="author" content="${escapeAttr(config.author)}" />
<meta name="generator" content="CyberNotes static builder" />
${page.keywords ? `<meta name="keywords" content="${escapeAttr(page.keywords)}" />` : ''}
<meta property="og:type" content="${page.ogType ?? 'website'}" />
<meta property="og:site_name" content="${escapeAttr(config.title)}" />
<meta property="og:title" content="${escapeAttr(page.title || config.title)}" />
<meta property="og:description" content="${escapeAttr(description)}" />
<meta property="og:url" content="${escapeAttr(canonical)}" />
${page.image ? `<meta property="og:image" content="${escapeAttr(absoluteUrl(origin, basePath, page.image))}" />` : ''}
<meta name="twitter:card" content="summary_large_image" />
<link rel="icon" href="${escapeAttr(link('/favicon.svg'))}" type="image/svg+xml" />
<link rel="alternate" type="application/rss+xml" title="${escapeAttr(`${config.title} — Notes`)}" href="${escapeAttr(link('/feed.xml'))}" />
<link rel="stylesheet" href="${escapeAttr(link('/assets/style.css'))}" />
${page.head ?? ''}
<script>
/* Applied before first paint so the theme never flashes. */
(function () {
  try {
    var stored = localStorage.getItem('cybernotes-theme');
    if (stored === 'light' || stored === 'dark') document.documentElement.dataset.theme = stored;
  } catch (e) { /* private mode */ }
})();
</script>
<script defer src="${escapeAttr(link('/assets/app.js'))}"></script>
<script defer src="${escapeAttr(link('/assets/search.js'))}"></script>
</head>
<body${bodyClass}>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="container site-header__inner">
    <a class="brand" href="${escapeAttr(link('/'))}">
      <span class="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2.5 4.5 5.6v5.7c0 4.6 3.1 8.9 7.5 10.2 4.4-1.3 7.5-5.6 7.5-10.2V5.6Z" />
          <path d="M9.2 12.1l1.9 1.9 3.7-4" />
        </svg>
      </span>
      <span class="brand__text">
        <span class="brand__name">${escapeHtml(config.title)}</span>
        <span class="brand__tagline">${escapeHtml(config.tagline)}</span>
      </span>
    </a>
    <nav class="site-nav" id="site-nav" aria-label="Main navigation">${navItems}</nav>
    <div class="header-tools">
      <button type="button" class="icon-btn" id="search-toggle" aria-expanded="false" aria-controls="header-search" title="Search notes (press /)">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
        <span class="icon-btn__label">Search</span>
      </button>
      <button type="button" class="icon-btn" id="theme-toggle" title="Toggle dark / light theme" aria-label="Toggle colour theme">
        <svg class="icon-moon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>
        <svg class="icon-sun" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M18.8 5.2l-1.4 1.4M6.6 17.4l-1.4 1.4" /></svg>
      </button>
      <button type="button" class="icon-btn icon-btn--menu" id="menu-toggle" aria-expanded="false" aria-controls="site-nav" aria-label="Toggle navigation menu">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
      </button>
    </div>
  </div>
  <div class="header-search" id="header-search" hidden>
    <div class="container header-search__inner">
      <label class="visually-hidden" for="header-search-input">Search notes</label>
      <input type="search" id="header-search-input" class="search-input" placeholder="Search notes, tags, tools…  (Esc to close)" autocomplete="off" spellcheck="false" data-search-input />
      <div class="search-results" id="header-search-results" data-search-results hidden></div>
    </div>
  </div>
</header>
<main id="main">
${page.content}
</main>
<footer class="site-footer">
  <div class="container site-footer__inner">
    <div class="site-footer__col">
      <p class="site-footer__brand">${escapeHtml(config.title)}</p>
      <p class="site-footer__note">Documenting authorized security practice. Notes are Markdown files in Git — see the <a href="${escapeAttr(link('/about/'))}">about page</a>.</p>
    </div>
    <div class="site-footer__col">
      <p class="site-footer__heading">Browse</p>
      <a class="footer__link" href="${escapeAttr(link('/notes/'))}">All notes</a>
      <a class="footer__link" href="${escapeAttr(link('/tags/'))}">Tags</a>
      <a class="footer__link" href="${escapeAttr(link('/search/'))}">Search</a>
      <a class="footer__link" href="${escapeAttr(link('/about/'))}">About</a>
    </div>
    <div class="site-footer__col">
      <p class="site-footer__heading">Elsewhere</p>
      ${social}
    </div>
    <div class="site-footer__col">
      <p class="site-footer__heading">Stats</p>
      <p class="footer__note">${page.footerStats ?? ''}</p>
    </div>
  </div>
  <div class="container site-footer__bottom">
    <span>© <span data-current-year>2026</span> ${escapeHtml(config.author)}</span>
    <span>Built with a zero-dependency Node script · hosted on GitHub Pages</span>
  </div>
</footer>
<dialog class="lightbox" id="lightbox">
  <button type="button" class="lightbox__close" data-lightbox-close aria-label="Close image">×</button>
  <img class="lightbox__img" data-lightbox-img alt="" />
  <p class="lightbox__caption" data-lightbox-caption></p>
</dialog>
</body>
</html>
`;
}

/* ------------------------------------------------------------------ page parts */

export function breadcrumbs(trail, link) {
  const items = trail.map((crumb, index) => {
    const isLast = index === trail.length - 1;
    if (isLast || !crumb.href) {
      return `<span class="crumbs__item" aria-current="page">${escapeHtml(crumb.label)}</span>`;
    }
    return `<a class="crumbs__item" href="${escapeAttr(link(crumb.href))}">${escapeHtml(crumb.label)}</a>`;
  }).join('<span class="crumbs__sep" aria-hidden="true">/</span>');
  return `<nav class="crumbs" aria-label="Breadcrumb">${items}</nav>`;
}

export function tagCloud(tags, link) {
  if (!tags.length) return '<p class="empty-note">No tags yet — add one to the front matter of a note.</p>';
  const max = Math.max(...tags.map((tag) => tag.count));
  return `<div class="tag-cloud">${tags.map((tag) => {
    const weight = max <= 1 ? 1 : tag.count / max;
    const size = (0.82 + weight * 0.42).toFixed(2);
    return `<a class="tag-cloud__item" href="${escapeAttr(link(`/tags/${tag.slug}/`))}" style="--tag-size:${size}rem">` +
      `<span class="tag-cloud__hash" aria-hidden="true">#</span>${escapeHtml(tag.name)}` +
      `<span class="tag-chip__count">${tag.count}</span></a>`;
  }).join('')}</div>`;
}

export function sectionHeading(title, subtitle, action) {
  return `<div class="section-head">
    <div>
      <h2 class="section-head__title">${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="section-head__subtitle">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    ${action ? `<div class="section-head__action">${action}</div>` : ''}
  </div>`;
}

export function statGrid(stats) {
  return `<dl class="stats">${stats.map((stat) =>
    `<div class="stats__item"><dt class="stats__label">${escapeHtml(stat.label)}</dt><dd class="stats__value">${escapeHtml(String(stat.value))}</dd></div>`).join('')}</dl>`;
}

export function pager(prev, next, link) {
  const cell = (note, direction) => {
    if (!note) return '<span class="pager__cell pager__cell--empty"></span>';
    const label = direction === 'prev' ? 'Previous' : 'Next';
    return `<a class="pager__cell" href="${escapeAttr(link(note.url))}">
      <span class="pager__dir">${label}</span>
      <span class="pager__title">${escapeHtml(note.title)}</span>
    </a>`;
  };
  return `<nav class="pager" aria-label="Note navigation">${cell(prev, 'prev')}${cell(next, 'next')}</nav>`;
}

export function noteListCompact(notes, link, limit = 6) {
  return `<ol class="note-list">${notes.slice(0, limit).map((note) => `
    <li class="note-list__item">
      <a class="note-list__title" href="${escapeAttr(link(note.url))}">${escapeHtml(note.title)}</a>
      <span class="note-list__meta"><time datetime="${escapeAttr(note.dateIso)}">${escapeHtml(note.dateDisplay)}</time>${note.tags.length ? ` · ${escapeHtml(note.tags.slice(0, 3).map((tag) => `#${tag.name}`).join(' '))}` : ''}</span>
    </li>`).join('')}</ol>`;
}

export function formatFooterStats(stats) {
  return `${stats.notes} notes · ${stats.tags} tags · updated ${formatDate(stats.updated)}`;
}

export { DIFFICULTY_LABELS };
