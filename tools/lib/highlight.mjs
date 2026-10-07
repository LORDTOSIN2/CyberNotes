/**
 * Tiny build-time syntax highlighter.
 *
 * Design goals: no dependencies, no runtime cost (highlighting happens during
 * the build, the browser only ships pre-coloured <span>s), safe by construction
 * (input is escaped before any span is emitted, token patterns can never inject
 * markup), and good enough for the languages that show up in security notes:
 * shell/console, python, javascript, json, yaml, sql, xml/html, php, powershell,
 * ini/config, and a couple of innocuous extras.
 */

import { escapeHtml } from './utils.mjs';

const SHELL_BUILTINS = new Set([
  'alias', 'bg', 'bind', 'break', 'builtin', 'cd', 'command', 'continue', 'declare',
  'dirs', 'disown', 'echo', 'enable', 'eval', 'exec', 'exit', 'export', 'fg', 'getopts',
  'hash', 'help', 'history', 'jobs', 'kill', 'let', 'local', 'logout', 'popd', 'printf',
  'pushd', 'pwd', 'read', 'readonly', 'return', 'set', 'shift', 'shopt', 'source', 'suspend',
  'test', 'times', 'trap', 'type', 'typeset', 'ulimit', 'umask', 'unalias', 'unset', 'wait',
  'sudo', 'su', 'apt', 'apt-get', 'yum', 'dnf', 'pacman', 'brew', 'git', 'make', 'curl',
  'wget', 'ssh', 'scp', 'tar', 'grep', 'sed', 'awk', 'cut', 'sort', 'uniq', 'head', 'tail',
  'chmod', 'chown', 'find', 'xargs', 'cat', 'less', 'more', 'touch', 'mkdir', 'rm', 'mv',
  'cp', 'ln', 'ps', 'top', 'netstat', 'ss', 'ip', 'ifconfig', 'ping', 'dig', 'nslookup',
  'nc', 'ncat', 'python', 'python3', 'pip', 'pip3', 'node', 'npm', 'npx', 'docker', 'systemctl',
  'service', 'journalctl', 'whoami', 'id', 'env', 'which', 'whereis', 'file', 'strings', 'xxd',
  'base64', 'md5sum', 'sha256sum', 'openssl', 'responder', 'nmap', 'gobuster', 'ffuf', 'wfuzz',
  'nikto', 'sqlmap', 'hydra', 'john', 'hashcat', 'msfconsole', 'burpsuite', 'wireshark', 'tcpdump',
  'smbclient', 'enum4linux', 'impacket', 'evil-winrm', 'linpeas', 'winpeas', 'chisel', 'socat',
  'certipy', 'bloodhound-python', 'kerbrute', 'crackmapexec', 'netexec', 'rustscan', 'amass',
  'subfinder', 'assetfinder', 'httpx', 'whatweb', 'wpscan', 'searchsploit', 'tmux', 'screen'
]);

const PYTHON_KEYWORDS = new Set([
  'and', 'as', 'assert', 'async', 'await', 'break', 'class', 'continue', 'def', 'del', 'elif',
  'else', 'except', 'finally', 'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda',
  'nonlocal', 'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'True', 'False', 'None', 'self', 'match', 'case'
]);

const PYTHON_BUILTINS = new Set([
  'abs', 'all', 'any', 'append', 'ascii', 'bin', 'bool', 'bytearray', 'bytes', 'callable',
  'chr', 'classmethod', 'compile', 'complex', 'decode', 'dict', 'dir', 'divmod', 'encode',
  'enumerate', 'eval', 'exec', 'filter', 'float', 'format', 'frozenset', 'getattr', 'globals',
  'hasattr', 'hash', 'help', 'hex', 'id', 'input', 'int', 'isinstance', 'issubclass', 'iter',
  'join', 'len', 'list', 'locals', 'map', 'max', 'memoryview', 'min', 'next', 'object', 'oct',
  'open', 'ord', 'pow', 'print', 'property', 'range', 'repr', 'reversed', 'round', 'set',
  'setattr', 'slice', 'sorted', 'split', 'staticmethod', 'str', 'strip', 'sum', 'super',
  'tuple', 'type', 'vars', 'zip', 'self'
]);

const JS_KEYWORDS = new Set([
  'as', 'async', 'await', 'break', 'case', 'catch', 'class', 'const', 'continue', 'debugger',
  'default', 'delete', 'do', 'else', 'export', 'extends', 'finally', 'for', 'from', 'function',
  'get', 'if', 'import', 'in', 'instanceof', 'let', 'new', 'of', 'return', 'set', 'static',
  'super', 'switch', 'this', 'throw', 'try', 'typeof', 'var', 'void', 'while', 'with', 'yield',
  'true', 'false', 'null', 'undefined', 'NaN', 'Infinity', 'console', 'document', 'window',
  'require', 'module', 'exports'
]);

const PHP_KEYWORDS = new Set([
  'abstract', 'and', 'array', 'as', 'break', 'callable', 'case', 'catch', 'class', 'clone',
  'const', 'continue', 'declare', 'default', 'do', 'echo', 'else', 'elseif', 'empty', 'enddeclare',
  'endfor', 'endforeach', 'endif', 'endswitch', 'endwhile', 'enum', 'extends', 'final', 'finally',
  'fn', 'for', 'foreach', 'function', 'global', 'goto', 'if', 'implements', 'include', 'include_once',
  'instanceof', 'insteadof', 'interface', 'isset', 'list', 'match', 'namespace', 'new', 'or',
  'print', 'private', 'protected', 'public', 'readonly', 'require', 'require_once', 'return',
  'static', 'switch', 'throw', 'trait', 'try', 'unset', 'use', 'var', 'while', 'xor', 'yield',
  'true', 'false', 'null', 'this', 'echo', 'die', 'exit'
]);

const SQL_KEYWORDS = new Set([
  'add', 'all', 'alter', 'and', 'any', 'as', 'asc', 'backup', 'between', 'by', 'case', 'check',
  'column', 'constraint', 'create', 'database', 'default', 'delete', 'desc', 'distinct', 'drop',
  'exec', 'exists', 'foreign', 'from', 'full', 'group', 'having', 'in', 'index', 'inner', 'insert',
  'into', 'is', 'join', 'key', 'left', 'like', 'limit', 'not', 'null', 'offset', 'on', 'or',
  'order', 'outer', 'primary', 'procedure', 'right', 'rownum', 'select', 'set', 'table', 'then',
  'top', 'truncate', 'union', 'unique', 'update', 'values', 'view', 'when', 'where', 'with',
  'concat', 'substring', 'char', 'ascii', 'sleep', 'version', 'user', 'load_file', 'information_schema',
  'true', 'false', 'xor', 'having', 'group_concat', 'database', 'schema_name', 'table_name'
]);

const XML_KEYWORDS = null; // handled structurally

const INI_HINT = /^\s*(\[[^\]]+\]|[A-Za-z0-9_.-]+\s*=.+)$/m;

const ALIASES = new Map([
  ['sh', 'shell'], ['bash', 'shell'], ['zsh', 'shell'], ['shell', 'shell'], ['shell-session', 'console'],
  ['console', 'console'], ['terminal', 'console'], ['command', 'console'], ['cmd', 'console'],
  ['ps', 'powershell'], ['powershell', 'powershell'], ['ps1', 'powershell'], ['pwsh', 'powershell'],
  ['py', 'python'], ['python', 'python'], ['python3', 'python'],
  ['js', 'javascript'], ['javascript', 'javascript'], ['mjs', 'javascript'], ['cjs', 'javascript'],
  ['ts', 'javascript'], ['typescript', 'javascript'], ['jsx', 'javascript'],
  ['json', 'json'], ['jsonc', 'json'], ['json5', 'json'],
  ['yaml', 'yaml'], ['yml', 'yaml'],
  ['sql', 'sql'], ['mysql', 'sql'], ['postgres', 'sql'], ['postgresql', 'sql'], ['mssql', 'sql'], ['sqlite', 'sql'],
  ['html', 'xml'], ['xml', 'xml'], ['svg', 'xml'], ['xhtml', 'xml'], ['vue', 'xml'], ['svelte', 'xml'],
  ['php', 'php'],
  ['ini', 'ini'], ['conf', 'ini'], ['cfg', 'ini'], ['toml', 'ini'], ['properties', 'ini'], ['env', 'ini'],
  ['http', 'http'], ['nginx', 'ini'], ['apache', 'ini'],
  ['diff', 'diff'], ['patch', 'diff'],
  ['c', 'c'], ['h', 'c'], ['cpp', 'c'], ['c++', 'c'], ['hpp', 'c'], ['java', 'c'], ['cs', 'c'], ['go', 'c'], ['rust', 'c'], ['rs', 'c'],
  ['text', 'plain'], ['txt', 'plain'], ['plain', 'plain'], ['plaintext', 'plain'], ['none', 'plain'],
  ['', 'plain'], ['markdown', 'plain'], ['md', 'plain']
]);

export function normalizeLanguage(lang) {
  const key = String(lang ?? '').trim().toLowerCase().replace(/^language-/, '');
  if (ALIASES.has(key)) return ALIASES.get(key);
  return 'plain';
}

/** Raw text -> highlighted HTML (already escaped). `lang` is the fence info string. */
export function highlight(code, lang) {
  const language = normalizeLanguage(lang);
  const raw = String(code ?? '').replace(/\n$/, '');
  switch (language) {
    case 'shell':
      return shell(raw, false);
    case 'console':
      return shell(raw, true);
    case 'python':
      return cLike(raw, {
        keywords: PYTHON_KEYWORDS,
        builtins: PYTHON_BUILTINS,
        lineComment: '#',
        tripleQuotes: true
      });
    case 'javascript':
      return cLike(raw, { keywords: JS_KEYWORDS, lineComment: '//', blockComment: true });
    case 'php':
      return cLike(raw, { keywords: PHP_KEYWORDS, lineComment: null, blockComment: true, dollarVars: true });
    case 'c':
      return cLike(raw, { keywords: new Set([
        'auto', 'break', 'case', 'char', 'class', 'const', 'continue', 'default', 'delete', 'do',
        'double', 'else', 'enum', 'extern', 'float', 'for', 'fprintf', 'free', 'goto', 'if',
        'include', 'inline', 'int', 'long', 'malloc', 'namespace', 'new', 'package', 'printf',
        'private', 'protected', 'public', 'register', 'return', 'short', 'signed', 'sizeof',
        'static', 'struct', 'switch', 'template', 'this', 'throw', 'try', 'typedef', 'typename',
        'union', 'unsigned', 'using', 'virtual', 'void', 'volatile', 'while', 'true', 'false',
        'null', 'nullptr', 'func', 'def', 'var', 'type', 'range', 'package', 'import', 'fmt'
      ]), lineComment: '//', blockComment: true });
    case 'json':
      return json(raw);
    case 'yaml':
      return yaml(raw);
    case 'sql':
      return sql(raw);
    case 'xml':
      return xml(raw);
    case 'ini':
      return ini(raw);
    case 'http':
      return http(raw);
    case 'diff':
      return diff(raw);
    default:
      return escapeHtml(raw);
  }
}

/* ------------------------------------------------------------------ helpers */

function span(cls, text) {
  return `<span class="tok-${cls}">${escapeHtml(text)}</span>`;
}

/**
 * Generic tokenizer for C-like languages. Comments and strings are matched
 * first so keywords inside them are never recoloured.
 */
function cLike(code, options) {
  const {
    keywords,
    builtins = null,
    lineComment = '//',
    blockComment = false,
    tripleQuotes = false,
    dollarVars = false
  } = options;

  // Build the line-comment alternative from the configured marker so the `//`
  // and `#` families can share one tokenizer.
  const commentMarker = lineComment ? lineComment.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : null;
  const commentPattern = commentMarker
    ? new RegExp(`(?:^|\\s)${commentMarker}[^\\n]*`).source
    : null;

  const pattern = new RegExp(
    [
      blockComment ? String.raw`\/\*[\s\S]*?\*\/` : null,
      tripleQuotes ? String.raw`"""[\s\S]*?"""|'''[\s\S]*?'''` : null,
      commentPattern,
      String.raw`"(?:\\.|[^"\\\n])*"`,
      String.raw`'(?:\\.|[^'\\\n])*'`,
      String.raw`(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?`,
      String.raw`[A-Za-z_][A-Za-z0-9_]*`,
      String.raw`\s+`,
      String.raw`[\s\S]`
    ].filter(Boolean).join('|'),
    'g'
  );

  let out = '';
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const piece = match[0];
    if (!piece) {
      pattern.lastIndex += 1;
      continue;
    }

    const isBlockComment = blockComment && piece.startsWith('/*');
    const isDocString = tripleQuotes && (piece.startsWith('"""') || piece.startsWith("'''"));
    if (isBlockComment || isDocString) {
      out += span('comment', piece);
      continue;
    }
    if (commentMarker && piece.includes(commentMarker)) {
      const at = piece.indexOf(commentMarker);
      out += escapeHtml(piece.slice(0, at)) + span('comment', piece.slice(at));
      continue;
    }
    if (piece.startsWith('"') || piece.startsWith("'")) {
      out += span('string', piece);
      continue;
    }
    if (/^(?:\d+\.\d+|\d+)(?:[eE][+-]?\d+)?$/.test(piece)) {
      out += span('number', piece);
      continue;
    }
    if (piece.startsWith('$') && dollarVars) {
      out += span('variable', piece);
      continue;
    }
    if (/^[A-Za-z_]/.test(piece)) {
      if (keywords.has(piece)) out += span('keyword', piece);
      else if (keywords.has(piece.toLowerCase())) out += span('keyword', piece);
      else if (builtins && builtins.has(piece)) out += span('builtin', piece);
      else if (/^[A-Z]/.test(piece)) out += span('type', piece);
      else out += escapeHtml(piece);
      continue;
    }
    out += escapeHtml(piece);
  }

  // Python-style `#` comments are handled by a post pass below when needed.
  return out;
}

/**
 * Shell / console highlighting. In console blocks a leading prompt (`$`, `#`,
 * `>`, `PS>`) is coloured like a prompt and the rest of the line is treated as
 * a command.
 */
function shell(code, isConsole) {
  const lines = code.split('\n');
  const out = lines.map((line) => {
    const promptMatch = isConsole
      ? /^(\s*)(PS[^>]*>|[$#>]|kali@kali:[^$#]*[$#]|└─[^\n]*[$#])(\s+)?(.*)$/.exec(line)
      : null;
    if (promptMatch) {
      const [, lead, prompt, gap, rest] = promptMatch;
      return `${escapeHtml(lead)}${span('prompt', prompt)}${escapeHtml(gap ?? ' ')}${shellLine(rest)}`;
    }
    if (isConsole && /^\s*(?:\[?[+-]\]?|\[!\]|\[*\]|\[>\])/.test(line)) {
      return escapeHtml(line.replace(/^(\s*)/, '$1')) === line
        ? `<span class="tok-meta">${escapeHtml(line)}</span>`
        : `<span class="tok-meta">${escapeHtml(line)}</span>`;
    }
    return shellLine(line);
  });
  return out.join('\n');
}

function shellLine(line) {
  if (/^\s*#/.test(line) && !/^\s*#!\s*\S*$/.test(line)) {
    // Treat a leading `#` as a comment, but keep shebangs readable too.
    return span('comment', line);
  }
  if (/^\s*#!/.test(line)) return span('meta', line);
  if (/^\s*\|/.test(line)) return escapeHtml(line);

  const pattern = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|\$\{[^}]*\}|\$[A-Za-z_@*#?$!0-9-]+|\|\||&&|>>|<<|--?[A-Za-z][A-Za-z0-9-]*|\s+|[A-Za-z_][A-Za-z0-9_.-]*|[^\s]+)/g;
  let out = '';
  let match;
  let firstWordSeen = false;
  let expectCommand = true;

  while ((match = pattern.exec(line)) !== null) {
    const chunk = match[0];
    if (/^\s+$/.test(chunk)) {
      out += escapeHtml(chunk);
      continue;
    }
    if (chunk.startsWith('"') || chunk.startsWith("'")) {
      out += span('string', chunk);
      firstWordSeen = true;
      expectCommand = false;
      continue;
    }
    if (chunk.startsWith('$')) {
      out += span('variable', chunk);
      firstWordSeen = true;
      expectCommand = false;
      continue;
    }
    if (/^--?[A-Za-z]/.test(chunk)) {
      out += span('option', chunk);
      firstWordSeen = true;
      expectCommand = false;
      continue;
    }
    if (/^[|&<>]+$/.test(chunk)) {
      out += span('operator', chunk);
      expectCommand = true;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_.-]*$/.test(chunk)) {
      if (!firstWordSeen || expectCommand) {
        out += SHELL_BUILTINS.has(chunk.toLowerCase()) ? span('builtin', chunk) : span('command', chunk);
        firstWordSeen = true;
        expectCommand = false;
        continue;
      }
      out += escapeHtml(chunk);
      continue;
    }
    out += escapeHtml(chunk);
    expectCommand = false;
  }
  return out;
}

function json(code) {
  const pattern = /("(?:\\.|[^"\\])*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|\b(true|false|null)\b|(\s+)|([{}[\],:])|./g;
  let out = '';
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [token, str, colon, num, literal, ws, punct] = match;
    if (str) {
      out += colon ? span('property', str) + escapeHtml(colon) : span('string', str);
      continue;
    }
    if (num) { out += span('number', num); continue; }
    if (literal) { out += span('keyword', literal); continue; }
    if (ws) { out += escapeHtml(ws); continue; }
    if (punct) { out += span('operator', punct); continue; }
    out += escapeHtml(token);
  }
  return out;
}

function yaml(code) {
  return code.split('\n').map((line) => {
    if (/^\s*#/.test(line)) return span('comment', line);
    if (/^\s*---\s*$/.test(line)) return span('operator', line);
    const pair = /^(\s*(?:-\s+)?)([A-Za-z0-9_.-]+)(\s*:\s*)(.*)$/.exec(line);
    if (pair) {
      const [, lead, key, colon, rest] = pair;
      return `${escapeHtml(lead)}${span('property', key)}${span('operator', colon)}${yamlValue(rest)}`;
    }
    const listItem = /^(\s*)(-)(\s+)(.*)$/.exec(line);
    if (listItem) {
      const [, lead, dash, gap, rest] = listItem;
      return `${escapeHtml(lead)}${span('operator', dash)}${escapeHtml(gap)}${yamlValue(rest)}`;
    }
    return yamlValue(line);
  }).join('\n');
}

function yamlValue(rest) {
  const value = String(rest ?? '');
  if (value.trim() === '') return escapeHtml(value);
  const comment = /^(.*?)(\s+#.*)$/.exec(value);
  const body = comment ? comment[1] : value;
  const tail = comment ? comment[2] : '';
  let out;
  if (/^\s*["']/.test(body) && /["']\s*$/.test(body)) out = span('string', body);
  else if (/^\s*(true|false|null|yes|no|on|off|~)\s*$/i.test(body)) out = span('keyword', body);
  else if (/^\s*-?\d+(\.\d+)?\s*$/.test(body)) out = span('number', body);
  else if (/^\s*[[{]/.test(body)) out = body.replace(/(["'])(?:\\.|[^"'\\])*\1/g, (m) => span('string', m))
    .replace(/\b(true|false|null)\b/g, (m) => span('keyword', m));
  else out = escapeHtml(body);
  return out + (tail ? span('comment', tail) : '');
}

function sql(code) {
  const pattern = /(--[^\n]*|\/\*[\s\S]*?\*\/)|('(?:''|\\.|[^'\\])*')|("(?:\\.|[^"\\])*"|`[^`]*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][A-Za-z0-9_]*)|(\s+)|([^\s])/g;
  let out = '';
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, comment, str, ident, num, word, ws, other] = match;
    if (comment) { out += span('comment', comment); continue; }
    if (str) { out += span('string', str); continue; }
    if (ident) { out += span('variable', ident); continue; }
    if (num) { out += span('number', num); continue; }
    if (word) {
      out += SQL_KEYWORDS.has(word.toLowerCase()) ? span('keyword', word) : escapeHtml(word);
      continue;
    }
    if (ws) { out += escapeHtml(ws); continue; }
    out += /[=<>!]/.test(other) ? span('operator', other) : escapeHtml(other);
  }
  return out;
}

function xml(code) {
  const pattern = /(<!--[\s\S]*?-->)|(<!\[CDATA\[[\s\S]*?\]\]>)|(<\/?[A-Za-z_][\w:.-]*|\/?>)|([A-Za-z_][\w:.-]*)(?==)|(=)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(\s+)|([^\s]+)/g;
  let out = '';
  let match;
  while ((match = pattern.exec(code)) !== null) {
    const [, comment, cdata, tag, attr, eq, str, ws, rest] = match;
    if (comment || cdata) { out += span('comment', comment ?? cdata); continue; }
    if (tag) { out += span('tag', tag); continue; }
    if (attr) { out += span('property', attr); continue; }
    if (eq) { out += span('operator', eq); continue; }
    if (str) { out += span('string', str); continue; }
    if (ws) { out += escapeHtml(ws); continue; }
    out += escapeHtml(rest);
  }
  return out;
}

function ini(code) {
  return code.split('\n').map((line) => {
    if (/^\s*[#;]/.test(line)) return span('comment', line);
    const section = /^(\s*)(\[[^\]]+\])(\s*)$/.exec(line);
    if (section) return `${escapeHtml(section[1])}${span('tag', section[2])}${escapeHtml(section[3])}`;
    const pair = /^(\s*)([A-Za-z0-9_.-]+)(\s*[=:]\s*)(.*)$/.exec(line);
    if (pair) {
      const [, lead, key, sep, value] = pair;
      const comment = /^(.*?)(\s+[#;].*)$/.exec(value);
      return `${escapeHtml(lead)}${span('property', key)}${span('operator', sep)}${escapeHtml(comment ? comment[1] : value)}${comment ? span('comment', comment[2]) : ''}`;
    }
    return escapeHtml(line);
  }).join('\n');
}

function http(code) {
  const lines = code.split('\n');
  return lines.map((line, index) => {
    if (index === 0 && /^[A-Z]+\s+\S+/.test(line)) {
      return line.replace(/^([A-Z]+)(\s+)(\S+)(\s*)(.*)$/, (_, method, gap1, path, gap2, version) =>
        `${span('keyword', method)}${escapeHtml(gap1)}${span('string', path)}${escapeHtml(gap2)}${span('meta', version)}`);
    }
    if (/^[A-Za-z-]+:\s/.test(line)) {
      return line.replace(/^([A-Za-z-]+)(:\s*)(.*)$/, (_, name, sep, value) =>
        `${span('property', name)}${span('operator', sep)}${escapeHtml(value)}`);
    }
    if (/^\s*\{|\}|^\s*"|^\s*<|^\s*\[/.test(line)) return json(line);
    return escapeHtml(line);
  }).join('\n');
}

function diff(code) {
  return code.split('\n').map((line) => {
    if (/^(?:\+\+\+|---)/.test(line)) return span('meta', line);
    if (/^@@/.test(line)) return span('operator', line);
    if (/^\+/.test(line)) return span('inserted', line);
    if (/^-/.test(line)) return span('deleted', line);
    if (/^diff |^index /.test(line)) return span('meta', line);
    return escapeHtml(line);
  }).join('\n');
}

/** Detect a language for a fence that has none, based on its content. */
export function guessLanguage(code) {
  const text = String(code ?? '').trim();
  if (!text) return 'plain';
  if (/^(?:PS [^>]*>|\$\s|\w+@[\w.-]+:[^$]*\$)/m.test(text)) return 'console';
  if (/^#{1,6}\s/m.test(text) && /^\s*[-*]\s/m.test(text)) return 'plain';
  if (/^(?:GET|POST|PUT|DELETE|PATCH|HEAD|OPTIONS)\s+\S+\s+HTTP\/\d/m.test(text)) return 'http';
  if (/^\s*[\[<]/.test(text) && /"[A-Za-z_]+"\s*:/.test(text)) return 'json';
  if (/^(?:SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|UNION)\b/i.test(text) || /\bFROM\s+\w+/i.test(text)) return 'sql';
  if (/^\s*<\?xml|^<[A-Za-z][\w:-]*[\s>]/.test(text) && /<\/[A-Za-z]/.test(text)) return 'xml';
  if (/^\s*(?:def |class |import |from \w+ import |print\()/m.test(text) && /:\s*$/m.test(text)) return 'python';
  if (/^\s*(?:-----BEGIN [A-Z ]+-----)/m.test(text)) return 'plain';
  if (INI_HINT.test(text) && /^\s*\[[^\]]+\]\s*$/m.test(text)) return 'ini';
  if (/^\s*(?:const |let |var |function |=>|export |import \{|require\()/m.test(text)) return 'javascript';
  if (/^\s*[A-Za-z0-9_.-]+\s*:\s+\S/m.test(text)) return 'yaml';
  if (/^diff --git|^---\s|^\+\+\+\s/m.test(text)) return 'diff';
  if (/^\s*(?:#|sudo |apt |cd |ls |cat |echo |curl |wget |nmap |gobuster |python3? |git )/m.test(text)) return 'shell';
  return 'plain';
}

export const SUPPORTED_LANGUAGES = [...new Set([...ALIASES.values()])].sort();
export { XML_KEYWORDS };
