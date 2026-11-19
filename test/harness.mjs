// Shared headless-browser setup for the tests. Run from the project root: npm test
import pp from 'puppeteer-core';
import fs from 'fs';
import { fileURLToPath, pathToFileURL } from 'url';
import path from 'path';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const APP_URL = pathToFileURL(path.join(ROOT, 'fine-line-notebook.html')).href;
export const file = (name) => fs.readFileSync(path.join(ROOT, 'test', 'files', name), 'utf8');
fs.mkdirSync(path.join(ROOT, 'test', 'out'), { recursive: true });

// Browser: CHROME_PATH if set, else a locally installed Chrome or Edge, else @sparticuz/chromium (Linux).
async function browserPath() {
  if (process.env.CHROME_PATH) return process.env.CHROME_PATH;
  const local = [
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/usr/bin/google-chrome', '/usr/bin/chromium'
  ].find(p => fs.existsSync(p));
  if (local) return local;
  const chromium = (await import('@sparticuz/chromium')).default;
  return chromium.executablePath();
}

export async function open(opts = {}) {
  const b = await pp.launch({ executablePath: await browserPath(), args: ['--allow-file-access-from-files', '--no-sandbox'], headless: true });
  const pg = await b.newPage();
  await pg.setViewport({ width: opts.w || 1440, height: opts.h || 900, deviceScaleFactor: 1 });
  const errors = [], dialogs = [];
  pg.on('pageerror', e => { errors.push(e.message); console.log('PAGEERROR: ' + e.message); });
  pg.on('dialog', async d => { dialogs.push(d.message()); if (d.type() === 'prompt') await d.accept(opts.prompt || ''); else await d.accept(); });
  await pg.goto(APP_URL);
  await sleep(400);
  return { b, pg, errors, dialogs };
}
export const sleep = (ms) => new Promise(r => setTimeout(r, ms));
// Poll a page function until it returns truthy (or time runs out); returns the last value.
export async function waitFor(pg, fn, arg, ms = 8000) { let v; for (const t0 = Date.now(); Date.now() - t0 < ms; await sleep(100)) { try { v = await pg.evaluate(fn, arg); } catch (e) { v = null; } if (v) return v; } return v; }

// Assertions print one line each, so a run reads as a checklist; any failure sets the exit code.
let fails = 0;
export function check(name, ok, detail) {
  console.log((ok ? 'ok   ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '  -> ' + (typeof detail === 'string' ? detail : JSON.stringify(detail))));
  if (!ok) { fails++; process.exitCode = 1; }
}
export function same(name, actual, expected) { check(name, JSON.stringify(actual) === JSON.stringify(expected), { expected, actual }); }
export const failures = () => fails;

// Page helpers (run in the browser)
export async function load(pg, html, name = 'test.html') { await pg.evaluate((t, n) => FLE.load(t, n), html, name); await sleep(300); }
export async function caretIn(pg, selector, atEnd = true) {
  await pg.evaluate((s, end) => { const c = document.querySelector(s); const r = document.createRange(); r.selectNodeContents(c); r.collapse(!end); const g = getSelection(); g.removeAllRanges(); g.addRange(r); c.closest('[contenteditable=true]').focus(); }, selector, atEnd);
  await sleep(30);
}
export async function caretCell(pg, table, r, c, atEnd = true) {
  await pg.evaluate((t, r, c, end) => { const x = document.querySelectorAll('#doc table')[t].rows[r].cells[c]; const g = document.createRange(); g.selectNodeContents(x); g.collapse(!end); const s = getSelection(); s.removeAllRanges(); s.addRange(g); }, table, r, c, atEnd);
  await sleep(30);
}
export const where = (pg) => pg.evaluate(() => { const n = getSelection().anchorNode; if (!n) return 'none'; const e = n.nodeType === 1 ? n : n.parentElement; const c = e.closest('td,th'); return c ? c.parentElement.rowIndex + ':' + c.cellIndex : 'outside:' + (e.closest('#doc > *') || e).tagName; });
export const shape = (pg, t = 0) => pg.evaluate((t) => [...document.querySelectorAll('#doc table')[t].rows].map(r => [...r.cells].map(c => (c.colSpan > 1 ? 'c' + c.colSpan : '') + (c.rowSpan > 1 ? 'r' + c.rowSpan : '') || '.').join(' ')).join(' | '), t);
export const click = (pg, action) => pg.click('#chrome button[data-a="' + action + '"]');
// Step the Show Index Levels button until it shows the level wanted.
export async function idxTo(pg, v) { for (let i = 0; i < 3 && await pg.$eval('#s-index', s => s.value) !== String(v); i++) { await pg.click('#s-index'); await sleep(40); } }
