/**
 * Dependency-free Markdown renderer tuned for security notes.
 *
 * Supported: headings (with anchors + TOC), paragraphs, emphasis/strong/del/
 * highlight, inline code, fenced code with build-time highlighting, tables with
 * alignment, ordered/unordered/task lists (nested), blockquotes, GitHub-style
 * callouts (`> [!WARNING]`), horizontal rules, images (standalone ones become
 * <figure>), links, reference links, autolinks, `#hashtags` turned into tag
 * links, `<details>` blocks, and a small sanitised raw-HTML allowlist.
 *
 * Everything is escaped by default; raw HTML survives only through the
 * allowlist, and URLs are scheme-checked before they reach an attribute.
 */

import { highlight, guessLanguage, normalizeLanguage } from './highlight.mjs';
import { escapeHtml, escapeAttr, slugify, uniqueSlug } from './utils.mjs';

const PH = '\u0000';
const CALLOUTS = {
  note: { label: 'Note', icon: 'ℹ', tone: 'info' },
  info: { label: 'Note', icon: 'ℹ', tone: 'info' },
  tip: { label: 'Tip', icon: '✦', tone: 'tip' },
  important: { label: 'Important', icon: '❕', tone: 'warn' },
  warning: { label: 'Warning', icon: '⚠', tone: 'warn' },
  caution: { label: 'Caution', icon: '⛔', tone: 'danger' },
  danger: { label: 'Danger', icon: '⛔', tone: 'danger' },
  lab: { label: 'Lab target', icon: '⌘', tone: 'lab' },
  opsec: { label: 'OpSec', icon: '🛡', tone: 'opsec' }
};

const RAW_BLOCK_TAGS = new Set(['details', 'summary', 'figure', 'figcaption', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'div', 'section', 'aside', 'p', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'br', 'hr', 'kbd', 'mark', 'sub', 'sup', 'small', 'abbr', 'code', 'pre', 'em', 'strong']);
const RAW_TAG_ATTRS = new Set(['class', 'id', 'href', 'src', 'alt', 'title', 'colspan', 'rowspan', 'open', 'width', 'height', 'loading', 'decoding', 'lang', 'dir', 'role', 'aria-label', 'target', 'rel']);

const VIDEO_EXT = /\.(?:mp4|webm|mov|m4v)$/i;

/* --------------------------------------------------------------- entry point */

/**
 * @param {string} source markdown body (front matter already removed)
 * @param {object} [options]
 * @param {(url: string) => string} [options.resolveUrl] rewrite relative links
 * @param {(tag: string) => string|null} [options.tagHref] final URL for a tag chip;
 *        return null to render the chip as plain text (used when no tag page exists)
 * @param {number} [options.headingStart] first heading level (default 2)
 * @returns {{ html: string, toc: Array<{id: string, text: string, level: number}> }}
 */
export function renderMarkdown(source, options = {}) {
  const ctx = {
    resolveUrl: options.resolveUrl ?? ((url) => url),
    tagHref: options.tagHref ?? ((tag) => `/tags/${slugify(tag)}/`),
    headingStart: options.headingStart ?? 2,
    usedIds: new Set(),
    toc: [],
    refs: new Map()
  };

  const lines = String(source ?? '')
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .split('\n');

  // Reference definitions (`[label]: url`) are collected up front.
  const bodyLines = [];
  for (const line of lines) {
    const ref = /^\s{0,3}\[([^\]]+)\]:\s*(\S+)(?:\s+["'(](.*)["')])?\s*$/.exec(line);
    if (ref) {
      ctx.refs.set(ref[1].trim().toLowerCase(), { href: ref[2], title: ref[3] ?? '' });
      continue;
    }
    bodyLines.push(line);
  }

  const html = parseBlocks(bodyLines, ctx);
  return { html, toc: ctx.toc };
}

/* ------------------------------------------------------------- block parsing */

function isBlank(line) {
  return /^\s*$/.test(line);
}

function startsBlock(lines, index, ctx) {
  const line = lines[index];
  if (isBlank(line)) return true;
  if (/^\s{0,3}(?:```|~~~)/.test(line)) return true;
  if (/^\s{0,3}#{1,6}\s/.test(line)) return true;
  if (/^\s{0,3}(?:[-*_])(?:\s*\1){2,}\s*$/.test(line)) return true;
  if (/^\s{0,3}>/.test(line)) return true;
  if (/^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test(line)) return true;
  if (/^\s*<(?:details|summary)\b/i.test(line)) return true;
  if (isTableStart(lines, index)) return true;
  return false;
}

function isTableStart(lines, index) {
  const head = lines[index];
  const delim = lines[index + 1];
  if (!head || !delim) return false;
  if (!head.includes('|')) return false;
  return /^\s*\|?\s*:?-{2,}:?\s*(?:\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(delim);
}

function parseBlocks(lines, ctx) {
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      i += 1;
      continue;
    }

    // Fenced code
    const fence = /^(\s{0,3})(`{3,}|~{3,})\s*([^`]*)$/.exec(line);
    if (fence) {
      const marker = fence[2][0].repeat(3);
      const info = fence[3].trim();
      const collected = [];
      i += 1;
      while (i < lines.length && !new RegExp(`^\\s{0,3}${marker === '```' ? '```' : '~~~'}\\s*$`).test(lines[i])) {
        collected.push(lines[i]);
        i += 1;
      }
      i += 1; // consume closing fence (or run off the end)
      out.push(renderCodeBlock(collected.join('\n'), info, ctx));
      continue;
    }

    // Headings
    const heading = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      out.push(renderHeading(heading[1].length, heading[2], ctx));
      i += 1;
      continue;
    }

    // Horizontal rule
    if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push('<hr />');
      i += 1;
      continue;
    }

    // <details> block: keep the wrapper, render the inside as markdown.
    if (/^\s*<details\b/i.test(line)) {
      const collected = [];
      while (i < lines.length && !/^\s*<\/details>\s*$/i.test(lines[i])) {
        collected.push(lines[i]);
        i += 1;
      }
      i += 1;
      const open = /^\s*<details\b([^>]*)>/i.exec(collected.shift() ?? '');
      const attrs = open && /\bopen\b/i.test(open[1]) ? ' open' : '';
      let summary = '';
      if (collected.length && /^\s*<summary\b/i.test(collected[0])) {
        const first = collected.shift();
        summary = /<summary\b[^>]*>([\s\S]*?)<\/summary>/i.exec(first)?.[1] ?? '';
      }
      const inner = parseBlocks(collected, ctx);
      out.push(
        `<details class="note-details"${attrs}>` +
        `<summary>${summary ? renderInline(summary, ctx) : 'Details'}</summary>` +
        `<div class="note-details__body">${inner}</div>` +
        '</details>'
      );
      continue;
    }

    // Blockquote / callout
    if (/^\s{0,3}>/.test(line)) {
      const collected = [];
      while (i < lines.length && (/^\s{0,3}>/.test(lines[i]) || (!isBlank(lines[i]) && !startsBlock(lines, i, ctx) && collected.length))) {
        collected.push(lines[i].replace(/^\s{0,3}>\s?/, ''));
        i += 1;
      }
      out.push(renderQuote(collected, ctx));
      continue;
    }

    // Tables
    if (isTableStart(lines, i)) {
      const collected = [];
      while (i < lines.length && lines[i].includes('|') && !isBlank(lines[i])) {
        collected.push(lines[i]);
        i += 1;
      }
      out.push(renderTable(collected));
      continue;
    }

    // Lists
    if (/^\s{0,3}(?:[-*+]|\d+[.)])\s+/.test(line)) {
      const [html, next] = renderList(lines, i, ctx);
      out.push(html);
      i = next;
      continue;
    }

    // Paragraph
    const para = [];
    while (i < lines.length && !startsBlock(lines, i, ctx)) {
      para.push(lines[i]);
      i += 1;
    }
    if (para.length) out.push(renderParagraph(para, ctx));
    else i += 1;
  }

  return out.join('\n');
}

function renderHeading(markdownLevel, rawText, ctx) {
  const level = Math.min(6, Math.max(1, markdownLevel + (ctx.headingStart - 1)));
  const text = String(rawText ?? '').trim();
  const id = uniqueSlug(slugify(text) || 'section', ctx.usedIds);
  const inline = renderInline(text, ctx);
  if (level >= 2 && level <= 4) {
    ctx.toc.push({ id, text: stripTags(inline), level });
  }
  const anchor = `<a class="heading-anchor" href="#${escapeAttr(id)}" aria-label="Link to this section">#</a>`;
  return `<h${level} id="${escapeAttr(id)}">${inline}${anchor}</h${level}>`;
}

function renderCodeBlock(code, info, ctx) {
  const meta = String(info ?? '').trim();
  const firstToken = meta.split(/[\s,]+/)[0] ?? '';
  const rawLang = /^\{.*\}$/.test(firstToken) ? '' : firstToken;
  const explicit = Boolean(rawLang);
  const language = explicit ? normalizeLanguage(rawLang) : guessLanguage(code);
  const label = explicit && rawLang ? rawLang.toLowerCase() : language === 'plain' ? 'text' : language;
  const highlighted = highlight(code, language);
  const filename = /(?:title|filename)=("[^"]+"|\S+)/.exec(meta)?.[1]?.replace(/^"|"$/g, '');
  const lineCount = code.trim() === '' ? 0 : code.replace(/\n$/, '').split('\n').length;

  return [
    '<div class="code-block" data-lang="' + escapeAttr(language) + '">',
    '<div class="code-block__bar">',
    `<span class="code-block__lang">${escapeHtml(label)}</span>`,
    filename ? `<span class="code-block__file">${escapeHtml(filename)}</span>` : '',
    '<span class="code-block__spacer"></span>',
    `<span class="code-block__lines" aria-hidden="true">${lineCount} line${lineCount === 1 ? '' : 's'}</span>`,
    '<button type="button" class="code-block__copy" data-copy aria-label="Copy code to clipboard">Copy</button>',
    '</div>',
    `<pre class="code" tabindex="0" data-language="${escapeAttr(language)}"><code class="language-${escapeAttr(language)}">${highlighted}</code></pre>`,
    '</div>'
  ].filter(Boolean).join('');
}

function renderQuote(lines, ctx) {
  const first = String(lines[0] ?? '').trim();
  const callout = /^\[!(\w+)\]\s*(.*)$/.exec(first);
  if (callout) {
    const key = callout[1].toLowerCase();
    const config = CALLOUTS[key] ?? { label: callout[1], icon: 'ℹ', tone: 'info' };
    const title = callout[2].trim() || config.label;
    const rest = lines.slice(1);
    const inner = parseBlocks(rest, ctx);
    return (
      `<aside class="callout callout--${config.tone}" role="note">` +
      `<p class="callout__title"><span class="callout__icon" aria-hidden="true">${config.icon}</span>${renderInline(title, ctx)}</p>` +
      `<div class="callout__body">${inner}</div>` +
      '</aside>'
    );
  }
  return `<blockquote>${parseBlocks(lines, ctx)}</blockquote>`;
}

function splitTableRow(row) {
  const trimmed = row.trim().replace(/^\|/, '').replace(/\|$/, '');
  const cells = [];
  let current = '';
  let escaped = false;
  for (const ch of trimmed) {
    if (escaped) {
      current += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '|') {
      cells.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

function renderTable(rows) {
  const head = splitTableRow(rows[0]);
  const aligns = splitTableRow(rows[1]).map((cell) => {
    const left = cell.startsWith(':');
    const right = cell.endsWith(':');
    if (left && right) return 'center';
    if (right) return 'right';
    if (left) return 'left';
    return null;
  });
  const body = rows.slice(2);
  const cell = (tag, content, index) => {
    const align = aligns[index];
    return `<${tag}${align ? ` class="ta-${align}"` : ''}>${renderInline(content, TABLE_CTX)}</${tag}>`;
  };
  return [
    '<div class="table-wrap">',
    '<table>',
    '<thead><tr>',
    head.map((value, index) => cell('th', value, index)).join(''),
    '</tr></thead>',
    body.length ? '<tbody>' : '',
    body.map((row) => `<tr>${splitTableRow(row).map((value, index) => cell('td', value, index)).join('')}</tr>`).join(''),
    body.length ? '</tbody>' : '',
    '</table>',
    '</div>'
  ].join('');
}

// Table cells are rendered without link/tag rewriting context; a permissive
// fallback context keeps inline formatting working there.
const TABLE_CTX = {
  resolveUrl: (url) => url,
  tagHref: () => null,
  refs: new Map(),
  usedIds: new Set()
};

function renderList(lines, startIndex, ctx) {
  const firstMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(lines[startIndex]);
  const baseIndent = firstMatch[1].length;
  const ordered = /\d/.test(firstMatch[2]);
  const startNumber = ordered ? parseInt(firstMatch[2], 10) : 1;
  const items = [];
  let i = startIndex;
  let current = null;
  let loose = false;

  while (i < lines.length) {
    const line = lines[i];

    if (isBlank(line)) {
      const next = lines[i + 1];
      if (next === undefined || isBlank(next)) break;
      const nextIndent = /^(\s*)/.exec(next)[1].length;
      const nextIsItem = /^\s*(?:[-*+]|\d+[.)])\s+/.test(next) && nextIndent <= baseIndent + 1;
      const nextContinuesItem = current && nextIndent > baseIndent;
      if (nextIsItem || nextContinuesItem) {
        loose = true;
        if (current) current.blank = true;
        i += 1;
        continue;
      }
      break;
    }

    const itemMatch = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/.exec(line);
    const indent = /^(\s*)/.exec(line)[1].length;

    if (itemMatch && indent <= baseIndent + 1) {
      const orderedMatch = ordered ? /^\d+[.)]$/.test(itemMatch[2]) : true;
      if (!orderedMatch) break;
      current = { lines: [itemMatch[3]], blank: false };
      items.push(current);
      i += 1;
      continue;
    }

    if (current && indent > baseIndent) {
      const strip = Math.min(indent, baseIndent + 2);
      current.lines.push(line.slice(strip));
      i += 1;
      continue;
    }

    break;
  }

  const rendered = items.map((item) => {
    let task = null;
    const taskMatch = /^\[([ xX])\]\s+(.*)$/.exec(item.lines[0]);
    if (taskMatch) {
      task = taskMatch[1].toLowerCase() === 'x';
      item.lines[0] = taskMatch[2];
    }
    const inner = parseBlocks(item.lines, ctx);
    const checkbox = task === null
      ? ''
      : `<input type="checkbox" disabled${task ? ' checked' : ''} aria-label="${task ? 'done' : 'not done'}" /> `;
    const hasBlockChild = /<(?:p|ul|ol|blockquote|div|pre|table|aside)[\s>]/.test(inner);
    const content = hasBlockChild || loose ? inner : inner.replace(/^<p>([\s\S]*?)<\/p>$/, '$1');
    return `<li${task === null ? '' : ' class="task-item"'}>${checkbox}${content}</li>`;
  });

  const tag = ordered ? 'ol' : 'ul';
  const attrs = ordered && startNumber !== 1 ? ` start="${startNumber}"` : '';
  const className = ordered ? ' class="list-ordered"' : '';
  return [`<${tag}${attrs}${className}>${rendered.join('')}</${tag}>`, i];
}

function renderParagraph(lines, ctx) {
  const text = lines.join('\n');
  const standaloneImage = /^!\[[^\]]*\]\([^)]+\)$/.exec(text.trim());
  if (standaloneImage) {
    return renderImage(standaloneImage[0], ctx, true);
  }
  const joined = lines
    .map((line, index) => (index < lines.length - 1 && /\s{2,}$/.test(line) ? `${line.replace(/\s+$/, '')}${PH}BR${PH}` : line))
    .join('\n');
  return `<p>${renderInline(joined, ctx)}</p>`;
}

/* ------------------------------------------------------------ inline parsing */

function isSafeUrl(url) {
  const value = String(url ?? '').trim();
  if (value === '') return true;
  if (/^\s*(?:javascript|vbscript|data|file):/i.test(value)) return false;
  return true;
}

function renderImage(token, ctx, block = false) {
  const match = /^!\[([^\]]*)\]\(\s*<?([^\s>)]+)>?(?:\s+["']([^"']*)["'])?\s*\)$/.exec(token.trim());
  if (!match) return escapeHtml(token);
  const [, alt, src, title] = match;
  if (!isSafeUrl(src)) return escapeHtml(alt);
  const href = ctx.resolveUrl(src);
  const isVideo = VIDEO_EXT.test(src);
  const titleAttr = title ? ` title="${escapeAttr(title)}"` : '';
  if (isVideo) {
    const media = `<video class="note-video" controls preload="metadata" src="${escapeAttr(href)}"${titleAttr}></video>`;
    return block ? `<figure class="note-figure">${media}${alt ? `<figcaption>${renderInline(alt, ctx)}</figcaption>` : ''}</figure>` : media;
  }
  const img = `<img src="${escapeAttr(href)}" alt="${escapeAttr(alt)}" loading="lazy" decoding="async"${titleAttr} />`;
  if (!block) {
    const wrapped = `<a class="note-image-link" href="${escapeAttr(href)}" data-lightbox data-caption="${escapeAttr(alt ?? '')}">${img}</a>`;
    return wrapped;
  }
  const caption = alt ? `<figcaption>${renderInline(alt, ctx)}</figcaption>` : '';
  return `<figure class="note-figure"><a class="note-image-link" href="${escapeAttr(href)}" data-lightbox data-caption="${escapeAttr(alt ?? '')}">${img}</a>${caption}</figure>`;
}

function renderLink(label, href, title, ctx) {
  const safeLabel = label ?? '';
  if (!isSafeUrl(href)) return escapeHtml(safeLabel || href);
  const external = /^https?:\/\//i.test(href);
  const resolved = external ? href : ctx.resolveUrl(href);
  const attrs = [
    `href="${escapeAttr(resolved)}"`,
    title ? ` title="${escapeAttr(title)}"` : '',
    external ? ' target="_blank" rel="noopener noreferrer"' : ''
  ].filter(Boolean).join(' ');
  const arrow = external ? '<span class="ext" aria-hidden="true">↗</span>' : '';
  return `<a ${attrs}>${safeLabel ? renderInline(safeLabel, ctx, true) : escapeHtml(resolved)}${arrow}</a>`;
}

/**
 * Inline renderer. Code spans, images and links are extracted to placeholders
 * first so their contents are never re-processed by the emphasis/tag passes.
 */
export function renderInline(input, ctx, nested = false) {
  const store = [];
  const keep = (html) => {
    store.push(html);
    return `${PH}${store.length - 1}${PH}`;
  };

  let text = String(input ?? '');

  // Inline code
  text = text.replace(/(`+)([\s\S]*?)\1/g, (_, __, code) => keep(`<code class="inline-code">${escapeHtml(String(code).replace(/^ | $/g, ''))}</code>`));

  // Images
  text = text.replace(/!\[([^\]]*)\]\(\s*<?([^\s>)]+)>?(?:\s+["']([^"']*)["'])?\s*\)/g, (match) => keep(renderImage(match, ctx, false)));

  // Inline links
  text = text.replace(/(?<!!)\[([^\]]*)\]\(\s*<?([^\s>)]+)>?(?:\s+["']([^"']*)["'])?\s*\)/g, (_, label, href, title) =>
    keep(renderLink(label, href, title, ctx)));

  // Reference links
  text = text.replace(/(?<!!)\[([^\]]+)\]\[([^\]]*)\]/g, (match, label, key) => {
    const ref = ctx.refs.get((key || label).trim().toLowerCase());
    if (!ref) return match;
    return keep(renderLink(label, ref.href, ref.title, ctx));
  });
  text = text.replace(/(?<!!)\[([^\]]+)\]/g, (match, label) => {
    const ref = ctx.refs.get(label.trim().toLowerCase());
    if (!ref) return match;
    return keep(renderLink(label, ref.href, ref.title, ctx));
  });

  // Autolinks and bare URLs
  text = text.replace(/<((?:https?|mailto):[^>\s]+)>/g, (_, url) => keep(renderLink(url, url, '', ctx)));
  text = text.replace(/(^|[\s(])((?:https?:\/\/|www\.)[^\s<>()]+[^\s<>().,;:])/g, (_, lead, url) => {
    const href = url.startsWith('www.') ? `https://${url}` : url;
    return `${lead}${keep(renderLink(url, href, '', ctx))}`;
  });

  // Raw HTML: sanitise rather than escape, so <kbd>, <details>… stay usable.
  text = text.replace(/<\/?[A-Za-z][^>]*>/g, (tag) => keep(sanitizeTag(tag)));

  // Escapes: \* etc.
  text = text.replace(/\\([\\`*_{}[\]()#+\-.!|>~])/g, (_, ch) => keep(escapeHtml(ch)));

  // The remaining text is literal.
  text = escapeHtml(text);
  text = text.replace(new RegExp(`${PH}BR${PH}`, 'g'), '<br />');

  // Emphasis family (order matters: strong before em).
  text = text
    .replace(/\*\*\*([^*\n]+)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(（])__([^_\n]+)__/g, '$1<strong>$2</strong>')
    .replace(/(^|[^*\w])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/(^|[\s(（])_([^_\n]+)_(?=[\s).,;:!?）]|$)/g, '$1<em>$2</em>')
    .replace(/~~([^~\n]+)~~/g, '<del>$1</del>')
    .replace(/==([^=\n]+)==/g, '<mark>$1</mark>');

  // Hashtags -> tag links. Skip placeholders, headings already handled, and
  // purely numeric references such as `#1` or `C#`.
  text = text.replace(/(^|[\s(（>])(#|＃)([A-Za-z\u3400-\u9fff][\w\u3400-\u9fff+./-]*)/g, (match, lead, _hash, tag) => {
    if (/^[\d\W]+$/.test(tag)) return match;
    if (/\.(?:md|py|sh|js|html|php|txt|conf|json|ya?ml)$/i.test(tag)) return match;
    const label = tag.replace(/[./-]+$/, '');
    if (!label) return match;
    // `tagHref` must return a ready-to-use URL (already includes the deployment
    // base path); resolving it here would apply the prefix twice.
    const href = ctx.tagHref(label);
    if (!href || nested) return `${lead}<span class="tag-inline tag-inline--plain">#${escapeHtml(label)}</span>`;
    return `${lead}<a class="tag-inline" href="${escapeAttr(href)}">#${escapeHtml(label)}</a>`;
  });

  // Restore placeholders.
  return text.replace(new RegExp(`${PH}(\\d+)${PH}`, 'g'), (_, index) => store[Number(index)] ?? '');
}

/** Allowlist-based sanitiser for raw HTML found in notes. */
export function sanitizeTag(tag) {
  const parsed = /^<\s*(\/?)\s*([A-Za-z][A-Za-z0-9-]*)([^>]*?)\/?\s*>$/.exec(tag);
  if (!parsed) return escapeHtml(tag);
  const [, closing, rawName, rawAttrs] = parsed;
  const name = rawName.toLowerCase();
  if (!RAW_BLOCK_TAGS.has(name)) return escapeHtml(tag);
  if (closing) return `</${name}>`;

  const attrs = [];
  const attrPattern = /([A-Za-z_:][-A-Za-z0-9_:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/g;
  let match;
  while ((match = attrPattern.exec(rawAttrs)) !== null) {
    const attrName = match[1].toLowerCase();
    const value = match[2] ?? match[3] ?? match[4] ?? '';
    if (!RAW_TAG_ATTRS.has(attrName)) continue;
    if (attrName.startsWith('on')) continue;
    if ((attrName === 'href' || attrName === 'src') && !isSafeUrl(value)) continue;
    if (attrName === 'src' && !/^(?:https?:|\/|\.{0,2}\/|data:image\/)/i.test(value)) continue;
    attrs.push(`${attrName}="${escapeAttr(value)}"`);
  }
  const selfClosing = /\/>$/.test(tag) || ['br', 'hr'].includes(name);
  return `<${name}${attrs.length ? ` ${attrs.join(' ')}` : ''}${selfClosing ? ' /' : ''}>`;
}

export function stripTags(html) {
  return String(html ?? '').replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
}
