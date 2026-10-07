#!/usr/bin/env node
/**
 * CyberNotes build.
 *
 * Reads `notes/**\/*.md`, renders every page into `dist/`, copies the static
 * assets, and writes the search index, RSS feed, sitemap and 404 page.
 * Node standard library only — no install step, which keeps GitHub Actions fast
 * and lets the whole site be rebuilt from the Markdown sources alone.
 *
 * Environment:
 *   BASE_PATH   force the deployment sub-path ('' for a root/custom domain)
 *   SITE_URL    force the canonical origin used in feeds and meta tags
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadNotes, buildSearchIndex, listNoteFiles } from './lib/notes.mjs';
import { buildPages } from './lib/pages.mjs';
import { layout, makeLinker, absoluteUrl, formatFooterStats } from './lib/templates.mjs';
import { escapeHtml, escapeAttr, isoDate } from './lib/utils.mjs';

const TOOL_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(TOOL_DIR, '..');
const DIST = path.join(ROOT, 'dist');

const t0 = Date.now();

/* ------------------------------------------------------------------- helpers */

function readJson(file, fallback) {
  if (!fs.existsSync(file)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    console.error(`\u2716 ${path.relative(ROOT, file)} is not valid JSON: ${error.message}`);
    process.exitCode = 1;
    return fallback;
  }
}

function normalizeBasePath(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw === '/' || raw === './') return '';
  return `/${raw.replace(/^\/+/, '').replace(/\/+$/, '')}`;
}

function resolveBasePath(config) {
  if (process.env.BASE_PATH !== undefined) return normalizeBasePath(process.env.BASE_PATH);
  // In Actions the repository name is the deployment sub-path
  // (user.github.io/repo/). Locally we default to the site root so that
  // `npm run dev` serves a working site at http://localhost:4173 without any
  // environment fiddling; set basePath in site.config.json (or BASE_PATH) to
  // preview the deployed layout instead.
  if (process.env.GITHUB_ACTIONS === 'true' && process.env.GITHUB_REPOSITORY) {
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1] ?? '';
    if (repo && !/\.github\.io$/i.test(repo)) return `/${repo}`;
    return '';
  }
  return normalizeBasePath(config.basePath ?? '');
}

/** Path component of the canonical URL, used only to warn about mismatches. */
function configuredUrlPath(config) {
  try {
    return normalizeBasePath(new URL(String(config.url ?? '')).pathname);
  } catch {
    return '';
  }
}

/**
 * Canonical origin (scheme + host, never a path). The deployment sub-path is
 * applied separately by `makeLinker`, so keeping them apart is what stops
 * absolute URLs from acquiring the repository name twice.
 */
function resolveSiteOrigin(config) {
  if (process.env.SITE_URL) {
    try {
      return new URL(process.env.SITE_URL).origin;
    } catch {
      return String(process.env.SITE_URL).replace(/\/+$/, '');
    }
  }
  const configured = String(config.url ?? '').trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      return configured.replace(/\/+$/, '');
    }
  }
  if (process.env.GITHUB_REPOSITORY) {
    const owner = process.env.GITHUB_REPOSITORY.split('/')[0];
    return `https://${owner.toLowerCase()}.github.io`;
  }
  return 'http://localhost:4173';
}

function rmrf(target) {
  fs.rmSync(target, { recursive: true, force: true });
}

function writeFile(relative, contents) {
  const target = path.join(DIST, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents, 'utf8');
  files.push(relative.split(path.sep).join('/'));
}

function copyDir(from, to, filter = () => true) {
  if (!fs.existsSync(from)) return 0;
  let count = 0;
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules') continue;
    const source = path.join(from, entry.name);
    const target = path.join(to, entry.name);
    if (entry.isDirectory()) {
      count += copyDir(source, target, filter);
    } else if (filter(source, entry.name)) {
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(source, target);
      files.push(path.relative(DIST, target).split(path.sep).join('/'));
      count += 1;
    }
  }
  return count;
}

const files = [];

/* ---------------------------------------------------------------------- build */

const configPath = path.join(ROOT, 'site.config.json');
const config = readJson(configPath, null);
if (!config) {
  console.error('\u2716 site.config.json is missing or unreadable.');
  process.exit(1);
}
config.title = config.title || 'CyberNotes';
config.tagline = config.tagline || 'Security notes';
config.description = config.description || '';
config.author = config.author || 'Unknown';
config.lang = config.lang || 'en';
config.nav = Array.isArray(config.nav) && config.nav.length
  ? config.nav
  : [{ label: 'Notes', href: '/notes/' }, { label: 'Tags', href: '/tags/' }, { label: 'Search', href: '/search/' }];

const basePath = resolveBasePath(config);
const siteOrigin = resolveSiteOrigin(config);
const siteUrl = `${siteOrigin}${basePath}`;
const link = makeLinker(basePath);

const { notes, tags, warnings } = loadNotes({ root: ROOT, basePath });

if (!notes.length) {
  console.warn('\u26a0 No notes found in notes/ — the site will build but every list will be empty.');
}
for (const warning of warnings) console.warn(`\u26a0 ${warning}`);

const buildTimestamp = new Date();
const buildInfo = {
  updated: buildTimestamp.toISOString().slice(0, 10),
  timestamp: buildTimestamp.toISOString().replace('T', ' ').slice(0, 16) + ' UTC',
  pageCount: 0,
  version: readJson(path.join(ROOT, 'package.json'), { version: '1.0.0' }).version
};

rmrf(DIST);
fs.mkdirSync(DIST, { recursive: true });

// 1. Static assets that the templates reference.
copyDir(path.join(ROOT, 'template'), path.join(DIST, 'assets'), (_file, name) => /\.(?:css|js|map)$/i.test(name));

// 2. Verbatim public files (favicon, robots.txt, CNAME, …) land at the site root.
copyDir(path.join(ROOT, 'public'), DIST);

// 3. Images and any other downloadable assets referenced by notes.
const imagesCopied = copyDir(path.join(ROOT, 'images'), path.join(DIST, 'images'));
const filesCopied = copyDir(path.join(ROOT, 'files'), path.join(DIST, 'files'));

// 4. Non-Markdown files living next to the notes keep their repository path.
let noteAssets = 0;
for (const entry of walkAssets(path.join(ROOT, 'notes'))) {
  const relative = path.relative(ROOT, entry).split(path.sep).join('/');
  const target = path.join(DIST, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(entry, target);
  files.push(relative);
  noteAssets += 1;
}

function* walkAssets(dir) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walkAssets(full);
    else if (!/\.(?:md|markdown)$/i.test(entry.name)) yield full;
  }
}

// 5. Pages.
const pages = buildPages({ notes, tags, config, basePath, siteOrigin, buildInfo });
buildInfo.pageCount = pages.length + 1; // + the 404 page
for (const page of pages) writeFile(page.outPath, page.html);

// 6. 404 page (GitHub Pages serves /404.html for unmatched paths).
writeFile('404.html', layout({
  title: 'Page not found',
  description: 'The page you asked for is not in this knowledge base.',
  navKey: '',
  footerStats: formatFooterStats({
    notes: notes.length,
    tags: tags.length,
    updated: buildInfo.updated
  }),
  content: `
<div class="container container--narrow">
  <div class="empty-state">
    <p class="empty-state__code">404</p>
    <h1 class="empty-state__title">That note does not exist (yet)</h1>
    <p class="empty-state__lede">The file may have been renamed, or the link may point at a path that was never built. Try the search, or start from the notes index.</p>
    <div class="hero__actions">
      <a class="btn btn--primary" href="${escapeAttr(link('/notes/'))}">All notes</a>
      <a class="btn" href="${escapeAttr(link('/tags/'))}">Browse tags</a>
      <a class="btn btn--ghost" href="${escapeAttr(link('/search/'))}">Search</a>
    </div>
  </div>
</div>`
}, { link, basePath, siteOrigin, config }));

// 7. Search index (client-side only, loaded on demand).
writeFile('assets/search-index.json', JSON.stringify(buildSearchIndex(notes, link)));

// 7b. Build manifest: lets tools/check.mjs and any deploy script learn the
// resolved deployment path without duplicating the inference logic.
writeFile('build-meta.json', `${JSON.stringify({
  version: buildInfo.version,
  built: buildTimestamp.toISOString(),
  basePath,
  siteUrl,
  notes: notes.length,
  tags: tags.length,
  pages: pages.length + 1
}, null, 2)}\n`);

// 8. Feed, sitemap, robots, .nojekyll.
const feedItems = notes.slice(0, 30).map((note) => `    <item>
      <title>${escapeHtml(note.title)}</title>
      <link>${escapeHtml(absoluteUrl(siteOrigin, basePath, note.url))}</link>
      <guid isPermaLink="true">${escapeHtml(absoluteUrl(siteOrigin, basePath, note.url))}</guid>
      <pubDate>${(note.dateObj ?? buildTimestamp).toUTCString()}</pubDate>
      ${note.tags.map((tag) => `<category>${escapeHtml(tag.name)}</category>`).join('\n      ')}
      <description>${escapeHtml(note.summary)}</description>
    </item>`).join('\n');

writeFile('feed.xml', `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escapeHtml(config.title)}</title>
    <link>${escapeHtml(siteUrl === `${siteOrigin}` ? `${siteOrigin}/` : `${siteUrl}/`)}</link>
    <description>${escapeHtml(config.description)}</description>
    <language>${escapeHtml(config.lang)}</language>
    <lastBuildDate>${buildTimestamp.toUTCString()}</lastBuildDate>
    <atom:link href="${escapeHtml(absoluteUrl(siteOrigin, basePath, '/feed.xml'))}" rel="self" type="application/rss+xml" />
${feedItems}
  </channel>
</rss>
`);

const sitemapPaths = [
  { path: '/', lastmod: buildInfo.updated },
  { path: '/notes/', lastmod: buildInfo.updated },
  { path: '/tags/', lastmod: buildInfo.updated },
  { path: '/difficulty/', lastmod: buildInfo.updated },
  { path: '/search/', lastmod: buildInfo.updated },
  { path: '/about/', lastmod: buildInfo.updated },
  ...notes.map((note) => ({ path: note.url, lastmod: note.updatedIso || note.dateIso || buildInfo.updated })),
  ...tags.map((tag) => ({ path: `/tags/${tag.slug}/`, lastmod: buildInfo.updated })),
  ...['beginner', 'intermediate', 'advanced', 'unrated']
    .filter((level) => notes.some((note) => note.difficulty === level))
    .map((level) => ({ path: `/difficulty/${level}/`, lastmod: buildInfo.updated }))
];

writeFile('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${sitemapPaths.map((entry) => `  <url>
    <loc>${escapeHtml(absoluteUrl(siteOrigin, basePath, entry.path))}</loc>
    <lastmod>${isoDate(entry.lastmod) || buildInfo.updated}</lastmod>
  </url>`).join('\n')}
</urlset>
`);

const robots = `User-agent: *
Allow: /

Sitemap: ${absoluteUrl(siteOrigin, basePath, '/sitemap.xml')}
`;
writeFile('robots.txt', robots);
writeFile('.nojekyll', '');

/* ---------------------------------------------------------------------- report */

const counts = {
  notes: notes.length,
  tags: tags.length,
  pages: files.filter((file) => file.endsWith('.html')).length,
  assets: files.length,
  images: imagesCopied + filesCopied + noteAssets
};

const bytes = files.reduce((total, file) => {
  try {
    return total + fs.statSync(path.join(DIST, file)).size;
  } catch {
    return total;
  }
}, 0);

console.log('');
console.log(`  CyberNotes build \u2014 ${new Date().toISOString().slice(0, 19).replace('T', ' ')}`);
console.log('  ' + '-'.repeat(58));
console.log(`  notes        ${counts.notes}`);
console.log(`  tags         ${counts.tags}`);
console.log(`  html pages   ${counts.pages}`);
console.log(`  copied files ${counts.assets} (${counts.images} media asset${counts.images === 1 ? '' : 's'})`);
console.log(`  dist size    ${(bytes / 1024).toFixed(1)} KB`);
console.log(`  base path    ${basePath || '/'}   site url ${siteUrl}`);

// Helpful nudge: a project-site URL with a root-local build is the one
// combination that looks wrong when opened over file:// or from a sub-path.
const urlPath = configuredUrlPath(config);
if (!process.env.CI && urlPath && urlPath !== basePath) {
  console.log(`  note         site.config.json url is ${urlPath}, this build serves / — CI sets the deployed path automatically;`);
  console.log(`               run with BASE_PATH='${urlPath}' to preview the deployed layout locally.`);
}console.log(`  build time   ${Date.now() - t0} ms`);
console.log('');
console.log('  Pages:');
for (const page of pages.slice(0, 12)) console.log(`    ${link(page.outPath.replace(/index\.html$/, ''))}`);
if (pages.length > 12) console.log(`    … and ${pages.length - 12} more`);
console.log('');

if (process.env.CI) {
  console.log(`::notice title=CyberNotes::Built ${counts.pages} pages from ${counts.notes} notes (${(bytes / 1024).toFixed(1)} KB)`);
}
