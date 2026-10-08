#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';

const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');
const target = args.find(a => !a.startsWith('--')) || 'index.html';

if (!fs.existsSync(target)) {
  console.error(`PHASE23 AUDIT: file not found: ${target}`);
  process.exit(2);
}

const html = fs.readFileSync(target, 'utf8');
const byteSize = Buffer.byteLength(html, 'utf8');
const firstBodyClose = html.indexOf('</body>');
const firstHtmlClose = html.indexOf('</html>');

function collectBlocks(tag) {
  const re = new RegExp(`<${tag}\\b([^>]*)>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const out = [];
  let m;
  let index = 0;
  while ((m = re.exec(html))) {
    index += 1;
    const attrs = m[1] || '';
    const body = m[2] || '';
    const id = attrs.match(/\bid\s*=\s*["']([^"']+)["']/i)?.[1] || null;
    const firstLine = body.split(/\r?\n/).map(x => x.trim()).find(Boolean) || '';
    out.push({
      index,
      id,
      attrs: attrs.trim(),
      start: m.index,
      bytes: Buffer.byteLength(m[0], 'utf8'),
      bodyBytes: Buffer.byteLength(body, 'utf8'),
      afterFirstHtmlClose: firstHtmlClose >= 0 && m.index > firstHtmlClose,
      firstLine: firstLine.slice(0, 140),
      body,
    });
  }
  return out;
}

const styles = collectBlocks('style');
const scripts = collectBlocks('script');
const failures = [];
const syntax = [];

for (const s of scripts) {
  if (/\bsrc\s*=/.test(s.attrs)) continue;
  const type = s.attrs.match(/\btype\s*=\s*["']([^"']+)["']/i)?.[1] || '';
  if (type && !/(?:javascript|ecmascript|module)/i.test(type)) continue;
  try {
    new vm.Script(s.body, { filename: `inline-script-${s.index}.js` });
    syntax.push({ index: s.index, ok: true });
  } catch (error) {
    const item = { index: s.index, ok: false, error: String(error?.message || error) };
    syntax.push(item);
    failures.push(`inline script ${s.index}: ${item.error}`);
  }
}

const htmlWithoutScripts = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
const staticIds = [...htmlWithoutScripts.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)].map(m => m[1]);
const idCounts = new Map();
for (const id of staticIds) idCounts.set(id, (idCounts.get(id) || 0) + 1);
const duplicateStaticIds = [...idCounts.entries()].filter(([, count]) => count > 1);
if (duplicateStaticIds.length) failures.push(`duplicate static ids: ${duplicateStaticIds.map(([id,n]) => `${id}x${n}`).join(', ')}`);

const requiredMarkers = [
  'phase22-formal-baseline-2026-10-04',
  'phase22-ui20-readability-density',
  'phase22-ui21-global-legacy-cleanup',
  'phase22-ui22-final-mobile-qa',
  'phase22-ui22-1-safari-hotfix',
];
const missingMarkers = requiredMarkers.filter(m => !html.includes(m));
if (missingMarkers.length) failures.push(`missing markers: ${missingMarkers.join(', ')}`);

const viewport = html.match(/<meta\s+name=["']viewport["'][^>]*>/i)?.[0] || '';
if (!viewport.includes('viewport-fit=cover')) failures.push('viewport-fit=cover is missing');

const requiredStaticIds = [
  'playerModal',
  'offseason',
  'tourneySelectionCard',
  'clubManagePanel-roster',
  'clubManagePanel-market',
  'clubLegendRegistryBody',
  'draft',
  'tournament',
  'standings',
];
const missingStaticIds = requiredStaticIds.filter(id => !idCounts.has(id));
if (missingStaticIds.length) failures.push(`missing static ids: ${missingStaticIds.join(', ')}`);

const requiredTokens = [
  'saveGameState',
  'loadGameState',
  'switchTab',
  'runNextPlayerFixture',
  'renderLegendRegistryPanel',
  'openClubManagePanel',
  'updateUI',
  'getLegalStartingFive',
  'id="skyArena"',
];
const missingTokens = requiredTokens.filter(t => !html.includes(t));
if (missingTokens.length) failures.push(`missing critical tokens: ${missingTokens.join(', ')}`);

const functionNames = [...html.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m => m[1]);
const reassignedNames = [
  ...html.matchAll(/\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\s*\(/g),
  ...html.matchAll(/\bwindow\.([A-Za-z_$][\w$]*)\s*=/g),
].map(m => m[1]);
const nameCounts = new Map();
for (const n of [...functionNames, ...reassignedNames]) nameCounts.set(n, (nameCounts.get(n) || 0) + 1);
const overrideHotspots = [...nameCounts.entries()]
  .filter(([, n]) => n > 1)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 30);

function localRefExists(ref) {
  if (!ref || /^(?:https?:|data:|blob:|#)/i.test(ref)) return true;
  const clean = ref.split(/[?#]/)[0];
  if (!clean) return true;
  return fs.existsSync(path.resolve(path.dirname(target), clean));
}

const externalScripts = [...html.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
const externalStyles = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*>/gi)].map(m => m[1]);
const missingExternalRefs = [...externalScripts, ...externalStyles].filter(ref => !localRefExists(ref));
if (missingExternalRefs.length) failures.push(`missing local external refs: ${missingExternalRefs.join(', ')}`);

const report = {
  target,
  byteSize,
  firstBodyClose,
  firstHtmlClose,
  styleBlocks: styles.length,
  scriptBlocks: scripts.length,
  inlineJsChecked: syntax.length,
  inlineJsFailures: syntax.filter(x => !x.ok),
  stylesAfterFirstHtmlClose: styles.filter(x => x.afterFirstHtmlClose).length,
  scriptsAfterFirstHtmlClose: scripts.filter(x => x.afterFirstHtmlClose).length,
  staticIdCount: staticIds.length,
  duplicateStaticIds,
  viewport,
  missingMarkers,
  missingStaticIds,
  missingTokens,
  externalScripts,
  externalStyles,
  missingExternalRefs,
  overrideHotspots,
  failures,
};

if (asJson) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log('PHASE23 SPLIT SAFETY AUDIT');
  console.log(`target: ${target}`);
  console.log(`size: ${byteSize.toLocaleString()} bytes`);
  console.log(`style/script blocks: ${styles.length}/${scripts.length}`);
  console.log(`late blocks after first </html>: style ${report.stylesAfterFirstHtmlClose}, script ${report.scriptsAfterFirstHtmlClose}`);
  console.log(`inline JS syntax: ${syntax.length - report.inlineJsFailures.length}/${syntax.length} OK`);
  console.log(`static IDs: ${staticIds.length}, duplicates: ${duplicateStaticIds.length}`);
  console.log(`viewport-fit=cover: ${viewport.includes('viewport-fit=cover') ? 'OK' : 'MISSING'}`);
  console.log(`critical markers: ${missingMarkers.length ? `MISSING ${missingMarkers.join(', ')}` : 'OK'}`);
  console.log(`external refs: scripts ${externalScripts.length}, styles ${externalStyles.length}`);
  console.log('override hotspots:');
  for (const [name, count] of overrideHotspots.slice(0, 12)) console.log(`  ${name}: ${count}`);
  if (failures.length) {
    console.log('FAILURES:');
    for (const f of failures) console.log(`  - ${f}`);
  } else {
    console.log('RESULT: PASS');
  }
}

if (strict && failures.length) process.exit(1);
