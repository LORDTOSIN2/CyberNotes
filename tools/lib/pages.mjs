/**
 * Page builders. Returns a flat list of `{ outPath, html }` records that the
 * build script writes into `dist/` (one directory per clean URL).
 */

import { escapeHtml, escapeAttr, truncate, byDateDesc } from './utils.mjs';
import {
  layout, makeLinker, absoluteUrl, tagChip, difficultyBadge, noteCard, breadcrumbs,
  tagCloud, sectionHeading, statGrid, pager, noteListCompact, formatFooterStats,
  difficultyLabel
} from './templates.mjs';

function jsonLd(data) {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, '\\u003c')}</script>`;
}

function joinKeywords(note) {
  return note.tags.map((tag) => tag.name).join(', ');
}

export function buildPages({ notes, tags, config, basePath, siteOrigin, buildInfo }) {
  const link = makeLinker(basePath);
  const pages = [];
  const tagMap = new Map(tags.map((tag) => [tag.slug, tag]));
  const newest = notes[0];
  const stats = {
    notes: notes.length,
    tags: tags.length,
    updated: newest?.dateObj ?? null
  };
  const footerStats = {
    notes: notes.length,
    tags: tags.length,
    updated: newest?.dateDisplay ?? new Date().toISOString().slice(0, 10)
  };

  const baseCtx = {
    link,
    basePath,
    siteOrigin,
    config,
    stats,
    x: {
      footerStats: formatFooterStats({ notes: stats.notes, tags: stats.tags, updated: buildInfo.updated })
    }
  };

  const page = (data) => ({ ...data });

  /* ------------------------------------------------------------------- home */

  const featured = notes.filter((note) => note.featured).slice(0, 3);
  const recent = notes.slice(0, 9);
  const homeTags = tags.slice(0, 18);
  const beginnerCount = notes.filter((note) => note.difficulty === 'beginner').length;

  pages.push(page({
    outPath: 'index.html',
    html: layout({
      title: '',
      navKey: 'home',
      description: config.description,
      canonical: '/',
      bodyClass: 'page-home',
      keywords: tags.map((tag) => tag.name).join(', '),
      footerStats: formatFooterStats(footerStats),
      content: `
<div class="container">
  <section class="hero">
    <p class="hero__eyebrow">Knowledge base · ${stats.notes} notes · ${stats.tags} tags</p>
    <h1 class="hero__title">${escapeHtml(config.tagline)}</h1>
    <p class="hero__lede">${escapeHtml(config.homeIntro)}</p>
    <div class="hero__actions">
      <a class="btn btn--primary" href="${escapeAttr(link('/notes/'))}">Browse all notes</a>
      <a class="btn" href="${escapeAttr(link('/tags/'))}">Explore tags</a>
      <a class="btn btn--ghost" href="${escapeAttr(link('/about/'))}">How this site works</a>
    </div>
    <form class="hero-search" role="search" action="${escapeAttr(link('/search/'))}" method="get" data-search-form>
      <label class="visually-hidden" for="hero-search-input">Search notes</label>
      <span class="hero-search__icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4.5 4.5" /></svg>
      </span>
      <input type="search" id="hero-search-input" name="q" class="hero-search__input" placeholder="Search titles, commands, tools, #tags…" autocomplete="off" spellcheck="false" data-search-input />
      <button class="hero-search__submit" type="submit">Search</button>
      <div class="search-results" data-search-results hidden></div>
    </form>
  </section>

  ${statGrid([
    { label: 'Notes', value: stats.notes },
    { label: 'Tags', value: stats.tags },
    { label: 'Beginner-friendly', value: beginnerCount },
    { label: 'Last updated', value: buildInfo.updated }
  ])}

  ${featured.length ? `<section class="section">
    ${sectionHeading('Featured notes', 'Hand-picked starting points', `<a class="link-more" href="${escapeAttr(link('/notes/'))}">All notes →</a>`)}
    <div class="note-grid">${featured.map((note) => noteCard(note, link)).join('')}</div>
  </section>` : ''}

  <section class="section">
    ${sectionHeading('Recent notes', 'Newest additions first', `<a class="link-more" href="${escapeAttr(link('/notes/'))}">All notes →</a>`)}
    <div class="note-grid">${recent.map((note) => noteCard(note, link)).join('')}</div>
  </section>

  <section class="section section--split">
    <div class="panel">
      ${sectionHeading('Popular tags', 'Click a tag to see every note that uses it')}
      ${tagCloud(homeTags, link)}
      <a class="link-more" href="${escapeAttr(link('/tags/'))}">All ${stats.tags} tags →</a>
    </div>
    <div class="panel">
      ${sectionHeading('Latest activity')}
      ${noteListCompact(notes, link, 6)}
    </div>
  </section>

  <section class="section">
    <div class="panel panel--intro">
      <h2 class="section-head__title">Add a note in one commit</h2>
      <p>Every card on this site is generated from a Markdown file. Drop a file into <code class="inline-code">notes/</code>, add the front matter, push — GitHub Actions rebuilds and redeploys the site.</p>
      <div class="code-block" data-lang="console">
        <div class="code-block__bar"><span class="code-block__lang">console</span><span class="code-block__spacer"></span><button type="button" class="code-block__copy" data-copy aria-label="Copy code to clipboard">Copy</button></div>
        <pre class="code" tabindex="0"><code><span class="tok-prompt">$</span> <span class="tok-command">git</span> add notes/nmap-basic-scanning.md
<span class="tok-prompt">$</span> <span class="tok-command">git</span> commit -m <span class="tok-string">"Add Nmap scanning notes"</span>
<span class="tok-prompt">$</span> <span class="tok-command">git</span> push</code></pre>
      </div>
      <p class="muted">See <a href="${escapeAttr(link('/about/'))}">about → workflow</a> for the full note template and the local preview commands.</p>
    </div>
  </section>
</div>`
    }, baseCtx)
  }));

  /* ------------------------------------------------------------ notes index */

  const difficultyCounts = ['beginner', 'intermediate', 'advanced', 'unrated']
    .map((level) => ({ level, count: notes.filter((note) => note.difficulty === level).length }));

  pages.push(page({
    outPath: 'notes/index.html',
    html: layout({
      title: 'All notes',
      navKey: 'notes',
      description: `Every note in ${config.title} — ${stats.notes} entries on recon, enumeration, web exploitation, Linux, networking and defensive hardening.`,
      canonical: '/notes/',
      bodyClass: 'page-notes',
      footerStats: formatFooterStats(footerStats),
      content: `
<div class="container">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Notes' }], link)}
  <header class="page-head">
    <h1 class="page-head__title">All notes</h1>
    <p class="page-head__lede">${stats.notes} notes across ${stats.tags} tags. Filter by tag or difficulty, sort by date, or use <a href="${escapeAttr(link('/search/'))}">search</a>.</p>
  </header>

  <div class="filter-bar">
    <div class="filter-bar__group">
      <label class="filter-bar__label" for="sort-select">Sort</label>
      <select id="sort-select" class="select" data-sort>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title">Title (A–Z)</option>
        <option value="reading">Longest read</option>
      </select>
    </div>
    <div class="filter-bar__group">
      <label class="filter-bar__label" for="difficulty-select">Difficulty</label>
      <select id="difficulty-select" class="select" data-difficulty>
        <option value="all">All levels</option>
        ${difficultyCounts.filter((entry) => entry.count > 0).map((entry) =>
        `<option value="${entry.level}">${escapeHtml(difficultyLabel(entry.level))} (${entry.count})</option>`).join('')}
      </select>
    </div>
    <div class="filter-bar__group filter-bar__group--grow">
      <label class="filter-bar__label" for="notes-search">Quick filter</label>
      <input type="search" id="notes-search" class="search-input search-input--small" placeholder="Filter by keyword…" data-card-filter autocomplete="off" spellcheck="false" />
    </div>
    <div class="filter-bar__actions">
      <a class="btn btn--ghost" href="${escapeAttr(link('/search/'))}">Full search</a>
      <button type="button" class="btn btn--ghost" data-clear-filters hidden>Clear</button>
    </div>
  </div>

  <div class="tag-filter" data-tag-filter>
    ${tags.map((tag) => `<button type="button" class="tag-chip tag-chip--filter" data-tag-toggle="${escapeAttr(tag.slug)}">#${escapeHtml(tag.name)}<span class="tag-chip__count">${tag.count}</span></button>`).join('')}
  </div>

  <p class="result-count" data-result-count aria-live="polite"></p>

  <div class="note-grid" data-note-grid>
    ${notes.map((note) => noteCard(note, link)).join('')}
  </div>
  <p class="empty-note" data-empty hidden>No notes match these filters. <button type="button" class="link-button" data-clear-filters>Clear filters</button></p>
</div>`
    }, baseCtx)
  }));

  /* ------------------------------------------------------------ note detail */

  notes.forEach((note, index) => {
    const newer = notes[index - 1] ?? null;
    const older = notes[index + 1] ?? null;
    const tocHtml = note.toc.length >= 3
      ? `<nav class="toc" aria-label="On this page">
          <p class="toc__title">On this page</p>
          <ol class="toc__list">
            ${note.toc.map((item) => `<li class="toc__item toc__item--l${item.level}"><a href="#${escapeAttr(item.id)}">${escapeHtml(item.text)}</a></li>`).join('')}
          </ol>
        </nav>`
      : '';

    const relatedHtml = note.related.length
      ? `<section class="section section--tight">
          ${sectionHeading('Related notes', 'Ranked by shared tags')}
          <div class="note-grid note-grid--compact">${note.related.map((other) => noteCard(other, link)).join('')}</div>
        </section>`
      : '';

    pages.push(page({
      outPath: `notes/${note.slug}/index.html`,
      html: layout({
        title: note.title,
        navKey: 'notes',
        description: note.summary,
        canonical: note.url,
        ogType: 'article',
        keywords: joinKeywords(note),
        image: note.cover || undefined,
        bodyClass: 'page-note',
        head: jsonLd({
          '@context': 'https://schema.org',
          '@type': 'TechArticle',
          headline: note.title,
          description: note.summary,
          datePublished: note.dateIso || undefined,
          dateModified: note.updatedIso || note.dateIso || undefined,
          keywords: note.tags.map((tag) => tag.name).join(', '),
          articleSection: note.tags.map((tag) => tag.name),
          author: { '@type': 'Person', name: config.author },
          publisher: { '@type': 'Organization', name: config.title },
          mainEntityOfPage: absoluteUrl(siteOrigin, basePath, note.url),
          url: absoluteUrl(siteOrigin, basePath, note.url)
        }),
        footerStats: formatFooterStats(footerStats),
        content: `
<div class="container">
  ${breadcrumbs([
          { label: 'Home', href: '/' },
          { label: 'Notes', href: '/notes/' },
          { label: truncate(note.title, 60) }
        ], link)}

  <div class="note-layout">
    <article class="note-article" data-note-article>
      <header class="note-header">
        <div class="note-header__tags">${note.tags.map((tag) => tagChip(tag, link, { className: 'tag-chip--sm' })).join('')}</div>
        <h1 class="note-title">${escapeHtml(note.title)}</h1>
        <p class="note-summary">${escapeHtml(note.summary)}</p>
        <div class="note-meta">
          ${difficultyBadge(note.difficulty, link)}
          <span class="note-meta__item"><span class="note-meta__label">Created</span> <time datetime="${escapeAttr(note.dateIso)}">${escapeHtml(note.dateDisplay)}</time></span>
          ${note.updatedDisplay ? `<span class="note-meta__item"><span class="note-meta__label">Updated</span> <time datetime="${escapeAttr(note.updatedIso)}">${escapeHtml(note.updatedDisplay)}</time></span>` : ''}
          <span class="note-meta__item">${note.readingTime} min read</span>
          <span class="note-meta__item">${note.wordCount} words</span>
        </div>
        <p class="note-source">
          Source: <a href="${escapeAttr(config.repo + '/blob/main/' + note.file)}" target="_blank" rel="noopener noreferrer"><code class="inline-code">${escapeHtml(note.file)}</code></a>
          <a class="note-source__edit" href="${escapeAttr(config.repo + '/edit/main/' + note.file)}" target="_blank" rel="noopener noreferrer">Edit this note</a>
        </p>
      </header>

      <div class="note-body markdown" data-note-body>
        ${note.html}
      </div>

      <footer class="note-footer">
        <div class="note-footer__tags">
          <span class="note-footer__label">Tagged</span>
          ${note.tags.map((tag) => tagChip(tag, link)).join('')}
        </div>
      </footer>

      ${pager(older, newer, link)}
    </article>

    <aside class="note-aside">
      ${tocHtml}
      <div class="aside-card">
        <p class="aside-card__title">Note details</p>
        <dl class="aside-dl">
          <dt>Difficulty</dt><dd>${escapeHtml(difficultyLabel(note.difficulty))}</dd>
          <dt>Tags</dt><dd>${note.tags.length}</dd>
          <dt>Reading time</dt><dd>${note.readingTime} min</dd>
          <dt>Updated</dt><dd>${escapeHtml(note.updatedDisplay || note.dateDisplay)}</dd>
        </dl>
        <button type="button" class="btn btn--ghost btn--block" data-copy-link data-link="${escapeAttr(absoluteUrl(siteOrigin, basePath, note.url))}">Copy link to this note</button>
      </div>
      ${note.related.length ? `<div class="aside-card">
        <p class="aside-card__title">Related</p>
        <ul class="aside-links">${note.related.map((other) => `<li><a href="${escapeAttr(link(other.url))}">${escapeHtml(other.title)}</a></li>`).join('')}</ul>
      </div>` : ''}
    </aside>
  </div>

  ${relatedHtml}
</div>`
      }, baseCtx)
    }));
  });

  /* ------------------------------------------------------------------- tags */

  pages.push(page({
    outPath: 'tags/index.html',
    html: layout({
      title: 'Tags',
      navKey: 'tags',
      description: `All ${stats.tags} tags in ${config.title}. Tags are plain words in a note's front matter — create a new one simply by using it.`,
      canonical: '/tags/',
      bodyClass: 'page-tags',
      footerStats: formatFooterStats(footerStats),
      content: `
<div class="container">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Tags' }], link)}
  <header class="page-head">
    <h1 class="page-head__title">Tags</h1>
    <p class="page-head__lede">${stats.tags} tags across ${stats.notes} notes. A tag page is generated automatically the moment a note uses it.</p>
  </header>
  ${tagCloud(tags, link)}
  <section class="section">
    ${sectionHeading('Tag directory', 'Every tag with its note count')}
    <div class="tag-table">
      ${tags.map((tag) => `<div class="tag-table__row">
        <a class="tag-table__name" href="${escapeAttr(link(`/tags/${tag.slug}/`))}"><span class="tag-chip__hash" aria-hidden="true">#</span>${escapeHtml(tag.name)}</a>
        <span class="tag-table__count">${tag.count} note${tag.count === 1 ? '' : 's'}</span>
        <span class="tag-table__preview">${tag.notes.slice(0, 3).map((note) => `<a href="${escapeAttr(link(note.url))}">${escapeHtml(truncate(note.title, 42))}</a>`).join(' · ')}</span>
      </div>`).join('')}
    </div>
  </section>
</div>`
    }, baseCtx)
  }));

  for (const tag of tags) {
    const relatedTags = new Map();
    for (const note of tag.notes) {
      for (const other of note.tags) {
        if (other.slug === tag.slug) continue;
        relatedTags.set(other.slug, (relatedTags.get(other.slug) ?? 0) + 1);
      }
    }
    const cooccurring = [...relatedTags.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([slug, count]) => ({ tag: tagMap.get(slug), count }))
      .filter((entry) => entry.tag);

    const sorted = [...tag.notes].sort(byDateDesc);
    pages.push(page({
      outPath: `tags/${tag.slug}/index.html`,
      html: layout({
        title: `#${tag.name}`,
        navKey: 'tags',
        description: `${tag.count} notes tagged #${tag.name} in ${config.title}.`,
        canonical: `/tags/${tag.slug}/`,
        keywords: tag.name,
        bodyClass: 'page-tag',
        footerStats: formatFooterStats(footerStats),
        content: `
<div class="container">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Tags', href: '/tags/' }, { label: `#${tag.name}` }], link)}
  <header class="page-head page-head--tag">
    <h1 class="page-head__title"><span class="tag-chip__hash" aria-hidden="true">#</span>${escapeHtml(tag.name)}</h1>
    <p class="page-head__lede">${tag.count} note${tag.count === 1 ? '' : 's'} tagged <code class="inline-code">#${escapeHtml(tag.name)}</code>.</p>
  </header>

  ${cooccurring.length ? `<div class="cooccur">
    <span class="cooccur__label">Often used with</span>
    ${cooccurring.map((entry) => `<a class="tag-chip tag-chip--sm" href="${escapeAttr(link(`/tags/${entry.tag.slug}/`))}">#${escapeHtml(entry.tag.name)}<span class="tag-chip__count">${entry.count}</span></a>`).join('')}
  </div>` : ''}

  <div class="filter-bar">
    <div class="filter-bar__group">
      <label class="filter-bar__label" for="sort-select">Sort</label>
      <select id="sort-select" class="select" data-sort>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title">Title (A–Z)</option>
        <option value="reading">Longest read</option>
      </select>
    </div>
  </div>

  <div class="note-grid" data-note-grid data-note-scope="tag">
    ${sorted.map((note) => noteCard(note, link)).join('')}
  </div>
</div>`
      }, baseCtx)
    }));
  }

  /* ------------------------------------------------------------- difficulty */

  const levelsWithNotes = ['beginner', 'intermediate', 'advanced', 'unrated']
    .filter((level) => notes.some((note) => note.difficulty === level));

  pages.push(page({
    outPath: 'difficulty/index.html',
    html: layout({
      title: 'Difficulty levels',
      navKey: 'notes',
      description: `Notes grouped by difficulty in ${config.title}.`,
      canonical: '/difficulty/',
      bodyClass: 'page-difficulty',
      footerStats: formatFooterStats(footerStats),
      content: `
<div class="container">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Difficulty' }], link)}
  <header class="page-head">
    <h1 class="page-head__title">Difficulty levels</h1>
    <p class="page-head__lede">A rough guide to how much background each note assumes.</p>
  </header>
  <div class="level-grid">
    ${levelsWithNotes.map((level) => {
        const group = notes.filter((note) => note.difficulty === level);
        return `<a class="level-card level-card--${level}" href="${escapeAttr(link(`/difficulty/${level}/`))}">
        ${difficultyBadge(level)}
        <span class="level-card__count">${group.length} note${group.length === 1 ? '' : 's'}</span>
        <span class="level-card__preview">${escapeHtml(truncate(group[0]?.title ?? '', 48))}${group.length > 1 ? ` +${group.length - 1} more` : ''}</span>
      </a>`;
      }).join('')}
  </div>
</div>`
    }, baseCtx)
  }));

  for (const level of levelsWithNotes) {
    const group = notes.filter((note) => note.difficulty === level).sort(byDateDesc);
    pages.push(page({
      outPath: `difficulty/${level}/index.html`,
      html: layout({
        title: difficultyLabel(level),
        navKey: 'notes',
        description: `${group.length} ${difficultyLabel(level).toLowerCase()} notes in ${config.title}.`,
        canonical: `/difficulty/${level}/`,
        bodyClass: 'page-difficulty',
        footerStats: formatFooterStats(footerStats),
        content: `
<div class="container">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Difficulty', href: '/difficulty/' }, { label: difficultyLabel(level) }], link)}
  <header class="page-head">
    <h1 class="page-head__title">${escapeHtml(difficultyLabel(level))} notes</h1>
    <p class="page-head__lede">${group.length} note${group.length === 1 ? '' : 's'} at this level.</p>
  </header>
  <div class="filter-bar">
    <div class="filter-bar__group">
      <label class="filter-bar__label" for="sort-select">Sort</label>
      <select id="sort-select" class="select" data-sort>
        <option value="newest">Newest first</option>
        <option value="oldest">Oldest first</option>
        <option value="title">Title (A–Z)</option>
        <option value="reading">Longest read</option>
      </select>
    </div>
  </div>
  <div class="note-grid" data-note-grid>
    ${group.map((note) => noteCard(note, link)).join('')}
  </div>
</div>`
      }, baseCtx)
    }));
  }

  /* ----------------------------------------------------------------- search */

  pages.push(page({
    outPath: 'search/index.html',
    html: layout({
      title: 'Search',
      navKey: 'search',
      description: `Search ${stats.notes} notes in ${config.title} by title, summary, tag or full text. Everything runs in the browser — no backend.`,
      canonical: '/search/',
      bodyClass: 'page-search',
      footerStats: formatFooterStats(footerStats),
      content: `
<div class="container">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Search' }], link)}
  <header class="page-head">
    <h1 class="page-head__title">Search</h1>
    <p class="page-head__lede">Matches note titles, summaries, tags and body text. Try <code class="inline-code">#nmap</code>, <code class="inline-code">sql injection</code>, or <code class="inline-code">priv esc</code>.</p>
  </header>
  <form class="search-hero" role="search" data-search-form>
    <label class="visually-hidden" for="search-page-input">Search notes</label>
    <input type="search" id="search-page-input" name="q" class="search-input search-input--hero" placeholder="Search ${stats.notes} notes…" autocomplete="off" spellcheck="false" data-search-input />
    <button type="submit" class="btn btn--primary">Search</button>
  </form>
  <div class="search-hints">
    <span class="search-hints__label">Quick tags</span>
    ${tags.slice(0, 12).map((tag) => `<button type="button" class="tag-chip tag-chip--sm" data-search-tag="${escapeAttr(tag.name)}">#${escapeHtml(tag.name)}</button>`).join('')}
  </div>
  <div class="search-panel" data-search-results-page>
    <p class="search-status" data-search-status aria-live="polite"></p>
    <div class="search-list" data-search-list></div>
  </div>
</div>`
    }, baseCtx)
  }));

  /* ------------------------------------------------------------------ about */

  const tagList = tags.map((tag) => tag.name);
  pages.push(page({
    outPath: 'about/index.html',
    html: layout({
      title: 'About',
      navKey: 'about',
      description: `How ${config.title} is organised: file layout, note front matter, tags, images, the Git workflow and GitHub Pages deployment.`,
      canonical: '/about/',
      bodyClass: 'page-about',
      footerStats: formatFooterStats(footerStats),
      content: `
<div class="container container--narrow">
  ${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'About' }], link)}
  <header class="page-head">
    <h1 class="page-head__title">About this knowledge base</h1>
    <p class="page-head__lede">${escapeHtml(config.description)}</p>
  </header>

  <div class="markdown">
    <h2 id="purpose">Purpose</h2>
    <p>${escapeHtml(config.homeIntro)}</p>

    <h2 id="authorization">Authorization &amp; scope</h2>
    <aside class="callout callout--opsec" role="note">
      <p class="callout__title"><span class="callout__icon" aria-hidden="true">🛡</span>What is documented here</p>
      <div class="callout__body"><p>${escapeHtml(config.authorizationNote)}</p></div>
    </aside>

    <h2 id="structure">Repository structure</h2>
    <div class="code-block" data-lang="text">
      <div class="code-block__bar"><span class="code-block__lang">text</span><span class="code-block__spacer"></span><button type="button" class="code-block__copy" data-copy>Copy</button></div>
      <pre class="code" tabindex="0"><code>CyberNotes/
├── notes/                  <span class="tok-comment"># one Markdown file per note (the only folder you edit)</span>
├── images/                 <span class="tok-comment"># screenshots and diagrams referenced from notes</span>
├── files/                  <span class="tok-comment"># optional downloads: PCAPs, PDFs, scripts</span>
├── template/               <span class="tok-comment"># CSS + browser JavaScript (not generated)</span>
├── tools/                  <span class="tok-comment"># the zero-dependency Node static-site builder</span>
├── public/                 <span class="tok-comment"># copied verbatim to the site root (favicon, CNAME)</span>
├── site.config.json        <span class="tok-comment"># title, tagline, author, URLs, navigation</span>
└── .github/workflows/deploy.yml   <span class="tok-comment"># build + publish to GitHub Pages on every push</span></code></pre>
    </div>

    <h2 id="front-matter">Note front matter</h2>
    <p>Every note starts with a YAML block. Only <code class="inline-code">title</code> is required in practice — everything else has a sensible fallback.</p>
    <div class="code-block" data-lang="yaml">
      <div class="code-block__bar"><span class="code-block__lang">yaml</span><span class="code-block__file">notes/my-new-note.md</span><span class="code-block__spacer"></span><button type="button" class="code-block__copy" data-copy>Copy</button></div>
      <pre class="code" tabindex="0"><code><span class="tok-operator">---</span>
<span class="tok-property">title</span><span class="tok-operator">:</span> <span class="tok-string">"Understanding Nmap SYN Scanning"</span>
<span class="tok-property">date</span><span class="tok-operator">:</span> <span class="tok-string">"2026-10-07"</span>
<span class="tok-property">updated</span><span class="tok-operator">:</span> <span class="tok-string">"2026-10-12"</span>        <span class="tok-comment"># optional</span>
<span class="tok-property">tags</span><span class="tok-operator">:</span>
  <span class="tok-operator">-</span> <span class="tok-string">nmap</span>
  <span class="tok-operator">-</span> <span class="tok-string">recon</span>
  <span class="tok-operator">-</span> <span class="tok-string">networking</span>
  <span class="tok-operator">-</span> <span class="tok-string">scanning</span>
<span class="tok-property">difficulty</span><span class="tok-operator">:</span> <span class="tok-string">beginner</span>      <span class="tok-comment"># beginner | intermediate | advanced</span>
<span class="tok-property">summary</span><span class="tok-operator">:</span> <span class="tok-string">"How TCP SYN scanning works."</span>
<span class="tok-property">featured</span><span class="tok-operator">:</span> <span class="tok-keyword">true</span>          <span class="tok-comment"># optional, pins it to the homepage</span>
<span class="tok-property">draft</span><span class="tok-operator">:</span> <span class="tok-keyword">false</span>            <span class="tok-comment"># true = keep it out of the build</span>
<span class="tok-operator">---</span></code></pre>
    </div>

    <h2 id="tags">Tags</h2>
    <p>Tags are just words in the front matter. Write <code class="inline-code">#nmap</code> anywhere in a note body and it becomes a link; the tag page, the tag cloud and the search index are regenerated automatically. There is no tag registry to maintain — currently in use: ${tagList.map((name) => `<a class="tag-inline" href="${escapeAttr(link(`/tags/${tagMap.get(name.toLowerCase())?.slug ?? ''}/`))}">#</a>`).length ? tags.slice(0, 24).map((tag) => `<a class="tag-inline" href="${escapeAttr(link(`/tags/${tag.slug}/`))}">#${escapeHtml(tag.name)}</a>`).join(' ') : 'none yet'}.</p>

    <h2 id="images">Images and media</h2>
    <p>Store files in <code class="inline-code">images/</code> and reference them with a relative path: <code class="inline-code">![Nmap output](../images/nmap-syn-scan.png)</code>. PNG, JPG, GIF, WebP and SVG are supported, as are MP4/WebM clips. Standalone images become captioned figures that open in a lightbox; anything else stays inline. Downloadable files (PDF, PCAP, scripts) live in <code class="inline-code">files/</code> and can be linked directly.</p>

    <h2 id="workflow">Git workflow</h2>
    <ol class="list-ordered">
      <li>Create a Markdown file in <code class="inline-code">notes/</code> (e.g. <code class="inline-code">notes/burp-intercepting-requests.md</code>).</li>
      <li>Add the front matter block and write the note.</li>
      <li>Commit and push.</li>
      <li>GitHub Actions builds the site and publishes it to GitHub Pages.</li>
    </ol>
    <div class="code-block" data-lang="console">
      <div class="code-block__bar"><span class="code-block__lang">console</span><span class="code-block__spacer"></span><button type="button" class="code-block__copy" data-copy>Copy</button></div>
      <pre class="code" tabindex="0"><code><span class="tok-prompt">$</span> <span class="tok-command">git</span> add notes/burp-intercepting-requests.md
<span class="tok-prompt">$</span> <span class="tok-command">git</span> commit -m <span class="tok-string">"Add Burp Suite interception notes"</span>
<span class="tok-prompt">$</span> <span class="tok-command">git</span> push</code></pre>
    </div>
    <p>Nothing in <code class="inline-code">dist/</code> is committed — the workflow rebuilds it from source, so the repository stays a set of Markdown files.</p>

    <h2 id="local">Local preview</h2>
    <p>Node.js 18+ is required. There are no dependencies to install.</p>
    <div class="code-block" data-lang="console">
      <div class="code-block__bar"><span class="code-block__lang">console</span><span class="code-block__spacer"></span><button type="button" class="code-block__copy" data-copy>Copy</button></div>
      <pre class="code" tabindex="0"><code><span class="tok-prompt">$</span> <span class="tok-command">npm</span> run build     <span class="tok-comment"># generate dist/</span>
<span class="tok-prompt">$</span> <span class="tok-command">npm</span> run dev       <span class="tok-comment"># build, then serve http://localhost:4173</span>
<span class="tok-prompt">$</span> <span class="tok-command">npm</span> run check     <span class="tok-comment"># build + link/asset integrity report</span></code></pre>
    </div>

    <h2 id="deploy">GitHub Pages deployment</h2>
    <ol class="list-ordered">
      <li>Push the repository to GitHub.</li>
      <li>Open <strong>Settings → Pages</strong> and set <strong>Source</strong> to <strong>GitHub Actions</strong>.</li>
      <li>Push to <code class="inline-code">main</code>; the workflow builds and deploys on its own.</li>
      <li>If you use a project URL (<code class="inline-code">user.github.io/repo/</code>) the builder detects it from the Actions environment. For a custom domain, set <code class="inline-code">BASE_PATH</code> to empty when running the build.</li>
    </ol>

    <h2 id="customise">Customising</h2>
    <p>Edit <code class="inline-code">site.config.json</code> to change the site title, tagline, description, author, canonical URL, repository links and the header navigation. Colours and typography live in CSS custom properties at the top of <code class="inline-code">template/style.css</code> — override <code class="inline-code">--accent</code> and friends to re-skin the whole site, both themes included.</p>

    <h2 id="stats">This build</h2>
    ${statGrid([
      { label: 'Notes', value: stats.notes },
      { label: 'Tags', value: stats.tags },
      { label: 'Pages generated', value: buildInfo.pageCount },
      { label: 'Built', value: buildInfo.timestamp }
    ])}
  </div>
</div>`
    }, baseCtx)
  }));

  return pages;
}
