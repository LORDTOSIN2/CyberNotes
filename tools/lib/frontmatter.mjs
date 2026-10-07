/**
 * Minimal YAML front matter reader.
 *
 * Supports exactly the subset that note metadata needs, so the project can stay
 * dependency free:
 *
 *   ---
 *   title: "Understanding Nmap SYN Scanning"
 *   date: "2026-10-07"
 *   updated: 2026-10-09
 *   tags:
 *     - nmap
 *     - recon
 *   difficulty: beginner
 *   summary: One line summary.
 *   featured: true
 *   draft: false
 *   ---
 *
 * Also accepted: inline lists `tags: [nmap, recon]`, single quotes, comments
 * after `#`, and block scalars (`|` / `>`) for long summaries.
 */

const BOOLEANS = new Map([
  ['true', true],
  ['yes', true],
  ['on', true],
  ['false', false],
  ['no', false],
  ['off', false]
]);

function stripComment(raw) {
  // Remove `# comment` only when the # is not inside a quoted string.
  let quote = null;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    if (quote) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#' && (i === 0 || /\s/.test(raw[i - 1]))) {
      return raw.slice(0, i);
    }
  }
  return raw;
}

export function parseScalar(raw) {
  let value = stripComment(String(raw ?? '')).trim();
  if (value === '') return '';

  const quoted = /^("([\s\S]*)"|'([\s\S]*)')$/.exec(value);
  if (quoted) {
    const inner = quoted[2] !== undefined ? quoted[2] : quoted[3];
    return inner.replace(/\\"/g, '"').replace(/\\n/g, '\n');
  }

  if (value.startsWith('[') && value.endsWith(']')) {
    return splitInlineList(value.slice(1, -1)).map((item) => parseScalar(item));
  }

  const lower = value.toLowerCase();
  if (BOOLEANS.has(lower)) return BOOLEANS.get(lower);

  if (/^-?\d+$/.test(value)) return Number(value);
  if (/^-?\d*\.\d+$/.test(value)) return Number(value);

  return value;
}

function splitInlineList(body) {
  const items = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < body.length; i += 1) {
    const ch = body[i];
    if (quote) {
      current += ch;
      if (ch === '\\') {
        current += body[i + 1] ?? '';
        i += 1;
      } else if (ch === quote) {
        quote = null;
      }
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    if (ch === ',') {
      items.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) items.push(current.trim());
  return items.filter((item) => item !== '');
}

/**
 * @param {string} source raw file contents
 * @returns {{ data: Record<string, unknown>, body: string, hasFrontMatter: boolean }}
 */
export function parseFrontMatter(source) {
  const text = String(source ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const start = /^---[ \t]*\n/.exec(text);
  if (!start) {
    return { data: {}, body: text, hasFrontMatter: false };
  }

  const lines = text.slice(start[0].length).split('\n');
  const data = {};
  let index = 0;
  let closed = false;

  while (index < lines.length) {
    const line = lines[index];

    if (/^(---|\.\.\.)[ \t]*$/.test(line)) {
      closed = true;
      index += 1;
      break;
    }

    if (line.trim() === '' || /^\s*#/.test(line)) {
      index += 1;
      continue;
    }

    const entry = /^([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/.exec(line);
    if (!entry) {
      index += 1;
      continue;
    }

    const key = entry[1];
    const rest = entry[2];
    index += 1;

    // Block scalar: `summary: |` or `summary: >`
    if (/^[|>][+-]?$/.test(rest.trim())) {
      const folded = rest.trim().startsWith('>');
      const collected = [];
      while (index < lines.length && (lines[index].trim() === '' || /^\s{2,}/.test(lines[index]))) {
        collected.push(lines[index].replace(/^\s{2}/, ''));
        index += 1;
      }
      const joined = folded
        ? collected.join(' ').replace(/\s+/g, ' ').trim()
        : collected.join('\n').trim();
      data[key] = joined;
      continue;
    }

    if (rest.trim() === '') {
      // Nested list ("- item") or a nested mapping.
      const items = [];
      const mapping = {};
      let kind = null;
      while (index < lines.length) {
        const candidate = lines[index];
        if (candidate.trim() === '') {
          index += 1;
          continue;
        }
        if (!/^\s+/.test(candidate)) break;
        const listItem = /^\s*[-*][ \t]+(.*)$/.exec(candidate);
        const mapItem = /^\s+([A-Za-z0-9_.-]+)[ \t]*:[ \t]*(.*)$/.exec(candidate);
        if (listItem) {
          kind = kind ?? 'list';
          if (kind !== 'list') break;
          items.push(parseScalar(listItem[1]));
          index += 1;
          continue;
        }
        if (mapItem) {
          kind = kind ?? 'map';
          if (kind !== 'map') break;
          mapping[mapItem[1]] = parseScalar(mapItem[2]);
          index += 1;
          continue;
        }
        break;
      }
      data[key] = kind === 'map' ? mapping : items;
      continue;
    }

    data[key] = parseScalar(rest);
  }

  const body = closed ? lines.slice(index).join('\n') : lines.join('\n');
  return { data, body, hasFrontMatter: closed };
}

/** Normalise a `tags:` value into a clean array of display labels. */
export function normalizeTags(value) {
  const list = Array.isArray(value)
    ? value
    : String(value ?? '')
      .split(/[,\n]/)
      .map((item) => item.trim());
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = String(raw ?? '').replace(/^#+/, '').trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

const DIFFICULTY_ALIASES = new Map([
  ['beginner', 'beginner'],
  ['easy', 'beginner'],
  ['basic', 'beginner'],
  ['intro', 'beginner'],
  ['entry', 'beginner'],
  ['intermediate', 'intermediate'],
  ['medium', 'intermediate'],
  ['moderate', 'intermediate'],
  ['advanced', 'advanced'],
  ['hard', 'advanced'],
  ['expert', 'advanced']
]);

export function normalizeDifficulty(value) {
  const key = String(value ?? '').trim().toLowerCase();
  if (!key) return 'unrated';
  return DIFFICULTY_ALIASES.get(key) ?? 'unrated';
}
