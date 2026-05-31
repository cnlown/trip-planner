#!/usr/bin/env node
// validate.js — sanity-checks trip-planner.html before pushing
const fs = require('fs');
const html = fs.readFileSync('./trip-planner.html', 'utf8');

let errors = 0, warnings = 0;
const E = (msg) => { console.error('  ✗  ' + msg); errors++; };
const W = (msg) => { console.warn ('  ⚠  ' + msg); warnings++; };
const OK = (msg) => { console.log ('  ✓  ' + msg); };

// ── 1. ONCLICK / ONINPUT / EVENT HANDLER REFERENCES ────────────────────────
console.log('\n── Event handler references ──');

// Collect all window.X = function definitions
const windowDefs = new Set(
  [...html.matchAll(/window\.([a-zA-Z_$][a-zA-Z0-9_$]*)\s*=/g)].map(m => m[1])
);

// Also collect plain function declarations (called via event delegation, etc.)
const funcDecls = new Set(
  [...html.matchAll(/^function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/gm)].map(m => m[1])
);

// Extract every function name used in inline event handler attributes
const handlerAttrs = ['onclick', 'oninput', 'onblur', 'onchange', 'onkeydown', 'onmouseover', 'onmouseout'];
const handlerPattern = new RegExp(`(?:${handlerAttrs.join('|')})="([^"]+)"`, 'g');
const calledFuncs = new Set();
for (const [, body] of html.matchAll(handlerPattern)) {
  for (const [, fn] of body.matchAll(/(?<![.\w])([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(/g)) {
    calledFuncs.add(fn);
  }
}

const builtins = new Set([
  'event', 'this', 'alert', 'confirm', 'setTimeout', 'clearTimeout',
  'parseInt', 'parseFloat', 'encodeURIComponent', 'Object', 'Array', 'Math',
  'String', 'Boolean', 'JSON', 'console', 'document', 'window', 'fetch',
  'rgba', 'rgb', 'hsl', 'hsla', 'var', 'calc', 'translate', 'translateY',
]);

let handlerOk = 0;
for (const fn of [...calledFuncs].sort()) {
  if (builtins.has(fn)) continue;
  if (windowDefs.has(fn) || funcDecls.has(fn)) { handlerOk++; }
  else { E(`Handler "${fn}()" called in HTML but window.${fn} is never defined`); }
}
OK(`${handlerOk} handler references resolve`);

// ── 2. getElementById REFERENCES vs ACTUAL IDs ──────────────────────────────
console.log('\n── getElementById references ──');

const getElCalls = new Set(
  [...html.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map(m => m[1])
);
const htmlIds = new Set(
  [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1])
);

let idOk = 0, idMissing = 0;
for (const id of [...getElCalls].sort()) {
  if (htmlIds.has(id)) { idOk++; }
  else { E(`getElementById("${id}") — no element with id="${id}" in HTML`); idMissing++; }
}
OK(`${idOk} getElementById calls resolve`);

// ── 3. FIRESTORE IMPORT vs USAGE ─────────────────────────────────────────────
console.log('\n── Firestore imports ──');

const importLine = html.match(/import\s*\{([^}]+)\}\s*from\s*'https:\/\/www\.gstatic\.com\/firebasejs[^']*\/firebase-firestore/);
if (!importLine) {
  E('Could not find Firestore import statement');
} else {
  const imported = new Set(importLine[1].split(',').map(s => s.trim()).filter(Boolean));
  const firestoreFns = ['collection','getDocs','addDoc','doc','updateDoc','getDoc','setDoc','deleteDoc','query','where','onSnapshot'];
  for (const fn of firestoreFns) {
    const usedInCode = new RegExp(`[^a-zA-Z0-9_$]${fn}\\s*\\(`).test(html);
    const isImported = imported.has(fn);
    if (usedInCode && !isImported) E(`${fn}() is used but NOT in the import list`);
    else if (isImported && !usedInCode) W(`${fn} is imported but never called — safe to remove`);
    else if (usedInCode && isImported) OK(`${fn}`);
  }
}

// ── 4. data-* ATTRIBUTE CONSISTENCY ──────────────────────────────────────────
console.log('\n── data-find-tab / ftab consistency ──');
const findTabs   = [...html.matchAll(/data-find-tab="([^"]+)"/g)].map(m => m[1]);
const ftabPanels = [...html.matchAll(/id="ftab-([^"]+)"/g)].map(m => m[1]);
const ftabSet = new Set(ftabPanels);
for (const t of findTabs) {
  if (ftabSet.has(t)) OK(`data-find-tab="${t}" → #ftab-${t}`);
  else E(`data-find-tab="${t}" has no matching id="ftab-${t}"`);
}

console.log('\n── modal-tab / tab-panel consistency ──');
const modalTabs   = [...html.matchAll(/data-tab="([^"]+)"/g)].map(m => m[1]);
const tabPanels   = [...html.matchAll(/id="tab-([^"]+)"/g)].map(m => m[1]);
const tabPanelSet = new Set(tabPanels);
for (const t of modalTabs) {
  if (tabPanelSet.has(t)) OK(`data-tab="${t}" → #tab-${t}`);
  else E(`data-tab="${t}" has no matching id="tab-${t}"`);
}

// ── 5. GOOGLE MAPS API KEY ────────────────────────────────────────────────────
console.log('\n── Google Maps script ──');
if (/libraries=places/.test(html)) OK('libraries=places present');
else E('libraries=places missing from Maps script URL');
if (/callback=initMap/.test(html)) OK('callback=initMap present');
else E('callback=initMap missing');

// ── SUMMARY ──────────────────────────────────────────────────────────────────
console.log('\n' + '─'.repeat(50));
if (errors === 0 && warnings === 0) {
  console.log('  ✓  All checks passed\n');
} else {
  if (warnings) console.log(`  ⚠  ${warnings} warning${warnings!==1?'s':''}`);
  if (errors)   console.log(`  ✗  ${errors} error${errors!==1?'s':''} — fix before pushing\n`);
  else          console.log('  ✓  No errors\n');
}
process.exit(errors > 0 ? 1 : 0);
