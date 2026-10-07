/**
 * Loads every Markdown note from `notes/`, parses front matter, renders the
 * body and derives everything the site needs (URLs, tag objects, related notes,
 * search index entries, TOC).
 */

import fs from 'node:fs';
import path from 'node:path';
import { parseFrontMatter, normalizeTags, normalizeDifficulty } from './frontmatter.mjs';
import { renderMarkdown } from './markdown.mjs';
import { makeLinker } from './templates.mjs';
import {
  slugify, uniqueSlug, parseDate, isoDate, formatDate, readingTime,
  toPlainText, truncate, byDateDesc, basenameNoExt, titleFromSlug
} from './utils.mjs';

const SKIP_PATTERN = /^(?:[._]|README)/i;

export function listNoteFiles(notesDir) {
  if (!fs.existsSync(notesDir)) return [];
  const out = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_PATTERN.test(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(?:md|markdown)$/i.test(entry.name)) out.push(full);
    }
  };
  walk(notesDir);
  return out.sort();
}

/**
 * Resolve a URL written inside a note.
 *
 * Absolute paths (`/images/x.png`), scheme URLs and fragments pass through.
 * Everything else is interpreted relative to the note file inside the
 * repository, which is what an author expects when they write
 * `![shot](../images/nmap.png)` next to a note that lives in `notes/`.
 */
export function resolveNoteUrl(rawUrl, noteRepoPath, link) {
  const url = String(rawUrl ?? '').trim();
  if (!url) return url;
  if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//i.test(url) || /^(?:mailto|tel|data):/i.test(url)) return url;
  if (url.startsWith('#')) return url;
  if (url.startsWith('/')) return link(url);

  const hashAt = url.indexOf('#');
  const queryAt = url.indexOf('?');
  let cut = url.length;
  if (hashAt !== -1) cut = Math.min(cut, hashAt);
  if (queryAt !== -1) cut = Math.min(cut, queryAt);
  const pathPart = url.slice(0, cut);
  const suffix = url.slice(cut);

  const noteDir = path.posix.dirname(String(noteRepoPath).split(path.sep).join('/'));
  let resolved = path.posix.normalize(path.posix.join(noteDir === '.' ? '' : noteDir, pathPart));
  if (resolved.startsWith('..')) resolved = resolved.replace(/^(?:\.\.\/)+/, '');
  return link(`/${resolved}`) + suffix;
}

function firstParagraph(body) {
  const clean = String(body ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .find((block) => block && !/^#{1,6}\s/.test(block) && !/^[>|\-*+!]/.test(block) && !/^\s*<details/i.test(block));
  return toPlainText(clean ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * @param {object} options
 * @param {string} options.root project root
 * @param {Array<{label: string, href: string}>} options.nav site navigation (for URL rewriting)
 * @returns {{ notes: object[], tags: object[], files: string[], warnings: string[] }}
 */
export function loadNotes({ root, basePath = '' }) {
  const link = makeLinker(basePath);
  const notesDir = path.join(root, 'notes');
  const files = listNoteFiles(notesDir);
  const warnings = [];
  const usedSlugs = new Set();
  const notes = [];

  // ---------------------------------------------------------------------
  // Pass 1: read every file and its front matter, so the set of tags is known
  // before any body is rendered. That lets `#tag` mentions in note bodies link
  // only to tag pages that will actually exist.
  // ---------------------------------------------------------------------
  const records = [];
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf8');
    const { data, body, hasFrontMatter } = parseFrontMatter(raw);
    const relative = path.relative(root, file).split(path.sep).join('/');
    const stem = basenameNoExt(file);

    if (!hasFrontMatter) {
      warnings.push(`${relative}: no YAML front matter block found — using defaults.`);
    }
    if (data.draft === true || String(data.draft ?? '').toLowerCase() === 'true') continue;

    const title = String(data.title ?? '').trim() || titleFromSlug(stem);
    const slug = data.slug ? slugify(String(data.slug)) : uniqueSlug(slugify(stem), usedSlugs);
    if (data.slug) {
      if (usedSlugs.has(slug)) warnings.push(`${relative}: duplicate slug "${slug}" — rename the file or set a unique slug.`);
      usedSlugs.add(slug);
    }

    const dateValue = data.date ?? data.created ?? null;
    const dateObj = parseDate(dateValue) ?? parseDate(data.updated) ?? null;
    if (!dateObj) warnings.push(`${relative}: missing or unparseable \`date\` in front matter.`);
    const updatedObj = parseDate(data.updated);
    const tagNames = normalizeTags(data.tags ?? data.tag);
    const tags = tagNames.map((name) => ({ name, slug: slugify(name) })).filter((tag) => Boolean(tag.slug));
    const difficulty = normalizeDifficulty(data.difficulty ?? data.level);
    const summary = String(data.summary ?? data.description ?? '').trim() || truncate(firstParagraph(body), 180);

    records.push({
      file,
      relative,
      stem,
      body,
      raw,
      slug,
      title,
      dateValue,
      dateObj,
      updatedObj,
      tags,
      difficulty,
      summary
    });
  }

  const knownTagSlugs = new Set();
  for (const record of records) {
    for (const tag of record.tags) knownTagSlugs.add(tag.slug);
  }

  // Mentioned-but-unused tags are collected here and surfaced as a hint: they
  // are rendered as plain chips instead of links to pages that do not exist.
  const unusedTagMentions = new Set();

  for (const record of records) {
    const { html, toc } = renderMarkdown(record.body, {
      // Relative links are resolved against the note's own folder inside the
      // repository (so `../images/x.png` from notes/ lands on /images/x.png),
      // then mapped through the deployment base path.
      resolveUrl: (url) => resolveNoteUrl(url, record.relative, link),
      tagHref: (tag) => {
        const tagSlug = slugify(tag);
        if (!tagSlug) return null;
        if (knownTagSlugs.has(tagSlug)) return link(`/tags/${tagSlug}/`);
        // No note uses this tag yet: keep the chip readable but do not link it
        // to a page that would 404.
        unusedTagMentions.add(tagSlug);
        return null;
      }
    });

    const plain = toPlainText(record.body);
    const note = {
      slug: record.slug,
      file: record.relative,
      fileName: path.basename(record.file),
      stem: record.stem,
      title: record.title,
      date: String(record.dateValue ?? ''),
      dateObj: record.dateObj,
      dateIso: isoDate(record.dateObj) || '',
      dateDisplay: formatDate(record.dateObj) || 'No date',
      updatedIso: record.updatedObj ? isoDate(record.updatedObj) : '',
      updatedDisplay: record.updatedObj ? formatDate(record.updatedObj) : '',
      tags: record.tags,
      difficulty: record.difficulty,
      summary: record.summary,
      featured: record.raw.startsWith('---') && /^featured:\s*true\s*$/im.test(record.raw.split(/^---\s*$/m)[1] ?? ''),
      cover: '',
      readingTime: readingTime(record.body),
      html,
      toc,
      body: record.body,
      plain,
      wordCount: plain.split(/\s+/).filter(Boolean).length
    };
    note.url = `/notes/${note.slug}/`;
    note.headings = toc.map((item) => item.text);
    notes.push(note);
  }

  if (unusedTagMentions.size) {
    warnings.push(
      `tag mention(s) with no note yet (shown as plain chips): ${[...unusedTagMentions].sort().map((slug) => `#${slug}`).join(', ')}`
    );
  }

  notes.sort(byDateDesc);
  notes.forEach((note, index) => { note.index = index; });

  // Tag registry
  const tagMap = new Map();
  for (const note of notes) {
    for (const tag of note.tags) {
      if (!tagMap.has(tag.slug)) tagMap.set(tag.slug, { name: tag.name, slug: tag.slug, notes: [], count: 0 });
      const entry = tagMap.get(tag.slug);
      entry.count += 1;
      entry.notes.push(note);
    }
  }
  const tags = [...tagMap.values()].sort((a, b) => (b.count - a.count) || a.name.localeCompare(b.name));

  // Related notes: shared tags dominate, then shared difficulty, then recency.
  for (const note of notes) {
    const own = new Set(note.tags.map((tag) => tag.slug));
    const scored = notes
      .filter((other) => other.slug !== note.slug)
      .map((other) => {
        const shared = other.tags.filter((tag) => own.has(tag.slug)).length;
        const bonus = other.difficulty === note.difficulty ? 0.25 : 0;
        return { note: other, score: shared * 2 + bonus };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => (b.score - a.score) || byDateDesc(a.note, b.note))
      .slice(0, 4)
      .map((entry) => entry.note);
    note.related = scored;
  }

  // Search blob for the static index and the lightweight card attribute.
  for (const note of notes) {
    const tagText = note.tags.map((tag) => `#${tag.name}`).join(' ');
    note.searchBlob = [note.title, note.summary, tagText, note.headings.join(' ')]
      .join(' ').toLowerCase();
    note.searchText = [note.title, note.summary, tagText, note.plain].join('\n').toLowerCase();
  }

  return { notes, tags, files, warnings };
}

/** Build the JSON payload consumed by the client-side search. */
export function buildSearchIndex(notes, link) {
  return {
    generated: new Date().toISOString(),
    notes: notes.map((note) => ({
      slug: note.slug,
      url: link(note.url),
      title: note.title,
      summary: note.summary,
      date: note.dateIso,
      display: note.dateDisplay,
      difficulty: note.difficulty,
      tags: note.tags.map((tag) => ({ name: tag.name, slug: tag.slug })),
      readingTime: note.readingTime,
      headings: note.headings,
      text: note.searchText
    }))
  };
}
