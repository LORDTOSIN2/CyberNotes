/**
 * Small shared helpers: escaping, slugs, dates, reading time, plain-text extraction.
 * No dependencies on purpose — the whole toolchain runs on the Node standard library.
 */

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

export function escapeAttr(value) {
  return escapeHtml(value);
}

/**
 * URL/file safe slug. Keeps CJK characters so Chinese tag names still produce
 * readable, stable URLs.
 */
export function slugify(input) {
  const slug = String(input ?? '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['"`’]/g, '')
    .replace(/[^a-z0-9\u3040-\u30ff\u3400-\u9fff]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

export function uniqueSlug(base, used) {
  let slug = base || 'section';
  if (!used.has(slug)) {
    used.add(slug);
    return slug;
  }
  let n = 2;
  while (used.has(`${slug}-${n}`)) n += 1;
  slug = `${slug}-${n}`;
  used.add(slug);
  return slug;
}

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

/** ISO date (or anything Date can parse) -> "07 Oct 2026". */
export function formatDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return `${String(date.getUTCDate()).padStart(2, '0')} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}`;
}

/** ISO date -> "2026-10-07" (sortable, used for <time datetime>). */
export function isoDate(value) {
  const date = parseDate(value);
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

export function parseDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  if (typeof value === 'number') return new Date(value);
  const text = String(value ?? '').trim();
  if (!text) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(text);
  if (match) {
    return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  }
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Rough reading time in minutes (code-heavy notes are slower to read). */
export function readingTime(markdownText) {
  const words = String(markdownText ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[#*`>_~|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Strip Markdown syntax to a plain text string (used for the search index). */
export function toPlainText(markdownText) {
  return String(markdownText ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code) => `${code}\n`)
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}#{1,6}\s+/gm, '')
    .replace(/^\s{0,3}>\s?/gm, '')
    .replace(/^\s{0,3}[-*+]\s+/gm, '')
    .replace(/^\s*\d+\.\s+/gm, '')
    .replace(/`{1,3}/g, '')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\|/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function truncate(text, max = 180) {
  const value = String(text ?? '').trim();
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1).trimEnd()}…`;
}

export function uniq(list) {
  return [...new Set(list)];
}

/** Sort helper: newest first, undated notes last. */
export function byDateDesc(a, b) {
  const at = a.dateObj ? a.dateObj.getTime() : -Infinity;
  const bt = b.dateObj ? b.dateObj.getTime() : -Infinity;
  return bt - at;
}

export function byDateAsc(a, b) {
  return -byDateDesc(a, b);
}

/** Portable basename without extension (path agnostic across win32/posix). */
export function basenameNoExt(filePath) {
  const base = String(filePath).split(/[\\/]/).pop() ?? '';
  return base.replace(/\.[^.]+$/, '');
}

export function titleFromSlug(slug) {
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((word) => (word.length <= 3 && /^[a-z]+$/.test(word) && !['how', 'why', 'the', 'and', 'for', 'not'].includes(word)
      ? word.toUpperCase()
      : word.charAt(0).toUpperCase() + word.slice(1)))
    .join(' ');
}

export function formatBytes(bytes) {
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = Number(bytes) || 0;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}
