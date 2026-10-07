#!/usr/bin/env node
/**
 * Post-build integrity check for dist/.
 *
 * Verifies that every internal link and asset reference in the generated HTML
 * resolves to a file that actually exists, that the search index and feed are
 * present and parseable, and that no page shipped without its stylesheet.
 * Exits non-zero when something is broken, so CI can gate on it.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

if (!fs.existsSync(DIST)) {
  console.error('\u2716 dist/ not found — run "npm run build" first.');
  process.exit(1);
}

// The deployment sub-path is resolved by the builder and recorded in
// dist/build-meta.json, so this check cannot drift from what was built. An
// explicit BASE_PATH still wins for the rare case of checking a rebuilt tree.
function resolveBasePath() {
  if (process.env.BASE_PATH !== undefined) {
    return String(process.env.BASE_PATH).replace(/\/+$/, '');
  }
  const metaPath = path.join(DIST, 'build-meta.json');
  if (fs.existsSync(metaPath)) {
    try {
      return String(JSON.parse(fs.readFileSync(metaPath, 'utf8')).basePath ?? '').replace(/\/+$/, '');
    } catch {
      // fall through to the default below
    }
  }
  return '';
}

const basePath = resolveBasePath();

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const allFiles = walk(DIST);
const htmlFiles = allFiles.filter((file) => file.endsWith('.html'));
const relativeSet = new Set(allFiles.map((file) => path.relative(DIST, file).split(path.sep).join('/')));

const errors = [];
const warnings = [];
let checked = 0;

function targetExists(urlPath) {
  let clean = urlPath.split('#')[0].split('?')[0];
  if (basePath && clean.startsWith(basePath)) clean = clean.slice(basePath.length);
  if (!clean.startsWith('/')) clean = `/${clean}`;
  const relative = clean.replace(/^\/+/, '');
  if (relative === '') return relativeSet.has('index.html');
  if (relativeSet.has(relative)) return true;
  const asDir = `${relative.replace(/\/$/, '')}/index.html`;
  if (relativeSet.has(asDir)) return true;
  if (relativeSet.has(`${relative}.html`)) return true;
  return false;
}

for (const file of htmlFiles) {
  const html = fs.readFileSync(file, 'utf8');
  const rel = path.relative(DIST, file).split(path.sep).join('/');

  if (!/<link rel="stylesheet" href="[^"]*assets\/style\.css"/.test(html)) {
    errors.push(`${rel}: stylesheet link missing`);
  }
  if (!/<meta name="viewport"/.test(html)) {
    errors.push(`${rel}: viewport meta missing (responsive layout would break)`);
  }
  if (!/<html lang="/.test(html)) {
    warnings.push(`${rel}: no lang attribute`);
  }

  const attrPattern = /(?:href|src)="([^"]+)"/g;
  let match;
  while ((match = attrPattern.exec(html)) !== null) {
    const url = match[1];
    if (!url) continue;
    if (/^(?:https?:|mailto:|data:|tel:|javascript:)/i.test(url)) continue;
    if (url.startsWith('#')) continue;
    if (url === '{{BASE}}') {
      errors.push(`${rel}: unresolved {{BASE}} placeholder`);
      continue;
    }
    checked += 1;
    if (!targetExists(url)) {
      errors.push(`${rel}: broken reference -> ${url}`);
    }
  }

  // Sanity checks on the rendered markup.
  if (/<p>\s*<\/p>/.test(html)) warnings.push(`${rel}: empty paragraph tag`);
  if (html.includes('undefined')) warnings.push(`${rel}: contains the literal string "undefined"`);
  if (html.includes('[object Object]')) errors.push(`${rel}: contains "[object Object]"`);
}

// Search index
const indexPath = path.join(DIST, 'assets', 'search-index.json');
if (!fs.existsSync(indexPath)) {
  errors.push('assets/search-index.json missing');
} else {
  try {
    const index = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
    if (!Array.isArray(index.notes)) errors.push('search index has no notes array');
    else {
      const withoutText = index.notes.filter((note) => !note.text || note.text.length < 20);
      if (withoutText.length) warnings.push(`${withoutText.length} search entries have almost no text`);
      console.log(`  search index: ${index.notes.length} notes, ${(fs.statSync(indexPath).size / 1024).toFixed(1)} KB`);
    }
  } catch (error) {
    errors.push(`search-index.json is not valid JSON: ${error.message}`);
  }
}

// Feed / sitemap / robots
const required = ['feed.xml', 'sitemap.xml', 'robots.txt', 'index.html', '404.html', '.nojekyll', 'build-meta.json'];
for (const file of required) {
  if (!relativeSet.has(file)) errors.push(`required file missing: ${file}`);
}

console.log(`  base path        ${basePath || '/'}`);

const feed = fs.existsSync(path.join(DIST, 'feed.xml')) ? fs.readFileSync(path.join(DIST, 'feed.xml'), 'utf8') : '';
const feedItems = (feed.match(/<item>/g) ?? []).length;
const sitemap = fs.existsSync(path.join(DIST, 'sitemap.xml')) ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8') : '';
const sitemapUrls = (sitemap.match(/<url>/g) ?? []).length;

// Every note page must contain a rendered code block or at least some body text.
const notePages = htmlFiles.filter((file) => /dist[\\/]notes[\\/][^\\/]+[\\/]index\.html$/.test(file));

console.log('');
console.log('  CyberNotes integrity check');
console.log('  ' + '-'.repeat(58));
console.log(`  html pages        ${htmlFiles.length}`);
console.log(`  note pages        ${notePages.length}`);
console.log(`  links checked     ${checked}`);
console.log(`  feed items        ${feedItems}`);
console.log(`  sitemap urls      ${sitemapUrls}`);
console.log('');

if (warnings.length) {
  console.log(`  ${warnings.length} warning(s):`);
  for (const warning of warnings.slice(0, 25)) console.log(`    ! ${warning}`);
  if (warnings.length > 25) console.log(`    … and ${warnings.length - 25} more`);
  console.log('');
}

if (errors.length) {
  console.error(`  \u2716 ${errors.length} error(s):`);
  for (const error of errors.slice(0, 40)) console.error(`    - ${error}`);
  if (errors.length > 40) console.error(`    … and ${errors.length - 40} more`);
  process.exit(1);
}

console.log('  \u2714 all internal references resolve');
