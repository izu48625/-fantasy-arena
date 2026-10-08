#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const args = process.argv.slice(2);
const force = args.includes('--force');
const positional = args.filter(a => !a.startsWith('--'));
const input = positional[0] || 'index.html';
const outDir = positional[1] || 'src/phase23';

if (!fs.existsSync(input)) {
  console.error(`PHASE23 EXTRACT: input not found: ${input}`);
  process.exit(2);
}
if (fs.existsSync(outDir) && !force) {
  console.error(`PHASE23 EXTRACT: output exists: ${outDir} (use --force to replace)`);
  process.exit(2);
}

const source = fs.readFileSync(input, 'utf8');
const sha256 = value => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const tokenRe = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
const parts = [];
let cursor = 0;
let match;

function addPart(kind, text, meta = {}) {
  if (!text) return;
  const index = parts.length;
  const ext = kind === 'style' ? 'style.htmlpart' : kind === 'script' ? 'script.htmlpart' : 'htmlpart';
  const file = `parts/${String(index).padStart(4, '0')}-${kind}.${ext}`;
  parts.push({
    index,
    kind,
    file,
    bytes: Buffer.byteLength(text, 'utf8'),
    sha256: sha256(text),
    ...meta,
    text,
  });
}

while ((match = tokenRe.exec(source))) {
  addPart('html', source.slice(cursor, match.index));
  const kind = match[1].toLowerCase();
  const tagText = match[0];
  const openTag = tagText.match(/^<[^>]+>/)?.[0] || '';
  const id = openTag.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || null;
  addPart(kind, tagText, { id });
  cursor = match.index + match[0].length;
}
addPart('html', source.slice(cursor));

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'parts'), { recursive: true });
for (const p of parts) {
  fs.writeFileSync(path.join(outDir, p.file), p.text, 'utf8');
  delete p.text;
}

const manifest = {
  schema: 'fantasy-arena-phase23-raw-parts-v1',
  input: path.basename(input),
  baselineBytes: Buffer.byteLength(source, 'utf8'),
  baselineSha256: sha256(source),
  partCount: parts.length,
  styleParts: parts.filter(p => p.kind === 'style').length,
  scriptParts: parts.filter(p => p.kind === 'script').length,
  entries: parts,
};
fs.writeFileSync(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

console.log('PHASE23 RAW EXTRACTION COMPLETE');
console.log(`input: ${input}`);
console.log(`output: ${outDir}`);
console.log(`parts: ${manifest.partCount} (style ${manifest.styleParts}, script ${manifest.scriptParts})`);
console.log(`baseline SHA-256: ${manifest.baselineSha256}`);
console.log('Next: node tools/phase23-build.mjs src/phase23/manifest.json --check');
