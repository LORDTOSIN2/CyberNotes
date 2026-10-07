#!/usr/bin/env node
/**
 * Local preview server for dist/. Zero dependencies, clean-URL aware, and it
 * rewrites nothing — what you see is what GitHub Pages will serve.
 *
 * Usage: node tools/serve.mjs [--port 4173] [--dist dist]
 */

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function argValue(flag, fallback) {
  const index = process.argv.indexOf(flag);
  return index !== -1 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const port = Number(process.env.PORT ?? argValue('--port', '4173'));
const distDir = path.resolve(ROOT, argValue('--dist', 'dist'));
const basePath = String(process.env.BASE_PATH ?? '').replace(/\/+$/, '');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.pdf': 'application/pdf',
  '.zip': 'application/zip',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2'
};

function safeJoin(root, requestPath) {
  const decoded = decodeURIComponent(requestPath.split('?')[0].split('#')[0]);
  const target = path.join(root, decoded);
  const normalizedRoot = path.resolve(root) + path.sep;
  const normalized = path.resolve(target);
  if (normalized !== path.resolve(root) && !normalized.startsWith(normalizedRoot)) return null;
  return normalized;
}

function resolveFile(urlPath) {
  let candidate = safeJoin(distDir, urlPath);
  if (!candidate) return null;

  const attempts = [];
  attempts.push(candidate);
  if (!path.extname(candidate)) {
    attempts.push(path.join(candidate, 'index.html'));
    attempts.push(`${candidate}.html`);
  }
  for (const attempt of attempts) {
    try {
      const stat = fs.statSync(attempt);
      if (stat.isDirectory()) {
        const index = path.join(attempt, 'index.html');
        if (fs.existsSync(index)) return index;
      } else if (stat.isFile()) {
        return attempt;
      }
    } catch {
      // try the next candidate
    }
  }
  return null;
}

if (!fs.existsSync(distDir)) {
  console.error(`\u2716 ${path.relative(ROOT, distDir)}/ does not exist yet — run "npm run build" first.`);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  let urlPath = req.url ?? '/';
  if (basePath && urlPath.startsWith(basePath)) urlPath = urlPath.slice(basePath.length) || '/';

  const file = resolveFile(urlPath);
  if (!file) {
    const notFound = path.join(distDir, '404.html');
    res.writeHead(404, { 'Content-Type': MIME['.html'] });
    res.end(fs.existsSync(notFound) ? fs.readFileSync(notFound) : 'Not found');
    return;
  }

  const ext = path.extname(file).toLowerCase();
  const headers = {
    'Content-Type': MIME[ext] ?? 'application/octet-stream',
    'Cache-Control': 'no-cache'
  };
  res.writeHead(200, headers);
  res.end(fs.readFileSync(file));
});

server.listen(port, () => {
  const base = basePath || '';
  console.log('');
  console.log(`  CyberNotes preview server`);
  console.log(`  serving ${path.relative(ROOT, distDir)}/ at http://localhost:${port}${base}/`);
  console.log('  press Ctrl+C to stop');
  console.log('');
});

export { server };
