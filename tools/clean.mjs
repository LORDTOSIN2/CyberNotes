#!/usr/bin/env node
/** Remove the generated dist/ directory. */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.join(ROOT, 'dist');

if (!fs.existsSync(dist)) {
  console.log('Nothing to clean — dist/ does not exist.');
  process.exit(0);
}

fs.rmSync(dist, { recursive: true, force: true });
console.log('Removed dist/.');
