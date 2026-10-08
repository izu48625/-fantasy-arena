#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const check = args.includes('--check');
const verifyParts = args.includes('--verify-parts');
const positional = args.filter(a => !a.startsWith('--'));
const manifestPath = positional[0] || 'src/phase23/manifest.json';
const outputPath = positional[1] || 'index.html';

if (!fs.existsSync(manifestPath)) {
  console.error(`PHASE23 BUILD: manifest not found: ${manifestPath}`);
  process.exit(2);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'fantasy-arena-phase23-raw-parts-v1' || !Array.isArray(manifest.entries)) {
  console.error('PHASE23 BUILD: unsupported manifest schema');
  process.exit(2);
}

const root = path.dirname(manifestPath);
const sha256 = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
let output = '';
const errors = [];

for (const entry of manifest.entries) {
  const file = path.join(root, entry.file);
  if (!fs.existsSync(file)) {
    errors.push(`missing part: ${entry.file}`);
    continue;
  }
  const text = fs.readFileSync(file, 'utf8');
  if (verifyParts && entry.sha256 && sha256(text) !== entry.sha256) {
    errors.push(`part hash changed: ${entry.file}`);
  }
  output += text;
}

if (errors.length) {
  console.error('PHASE23 BUILD FAILED');
  for (const e of errors) console.error(`- ${e}`);
  process.exit(1);
}

const bytes = Buffer.byteLength(output, 'utf8');
const hash = sha256(output);
const baselineMatch = hash === manifest.baselineSha256 && bytes === manifest.baselineBytes;

if (check) {
  console.log('PHASE23 BUILD CHECK');
  console.log(`parts: ${manifest.entries.length}`);
  console.log(`bytes: ${bytes.toLocaleString()}`);
  console.log(`SHA-256: ${hash}`);
  console.log(`baseline parity: ${baselineMatch ? 'PASS' : 'CHANGED'}`);
  if (!baselineMatch) process.exit(1);
  process.exit(0);
}

fs.writeFileSync(outputPath, output, 'utf8');
console.log('PHASE23 BUILD COMPLETE');
console.log(`output: ${outputPath}`);
console.log(`bytes: ${bytes.toLocaleString()}`);
console.log(`SHA-256: ${hash}`);
console.log(`baseline parity: ${baselineMatch ? 'PASS' : 'CHANGED'}`);
