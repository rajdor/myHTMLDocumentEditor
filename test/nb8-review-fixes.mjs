// Notebook fixes from the review of saved files. A new page with no H1 is saved as Untitled and the first number free in
// its folder, and its saved title follows the name. In a Markdown file: inline code is written as plain code even with
// formatting inside (named before saving); lists cannot be made in a table cell (Markdown tables cannot hold them);
// raw HTML with attributes is shown without them and named as not kept; a code block of blank lines saves the same
// twice. Every Markdown file the structure tests write reads the same in micromark with GFM (the reference parser)
// as in marked, which the notebook reads with.
import { open, sleep, check, same, ROOT } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
import { matrix } from './structure-matrix.mjs';
import { micromark } from 'micromark';
import { gfm, gfmHtml } from 'micromark-extension-gfm';
import { marked } from 'marked';
const { b, pg, errors, dialogs } = await open({ prompt: '2,2' });
await pg.evaluate(installMockFs);
const q = (f, ...a) => pg.evaluate(f, ...a);
const row = (p) => '.nb-row[title="' + p + '"]';
const paths = () => q(() => MFS.paths(R));
const text = (p) => q((p) => MFS.text(R, p), p);
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(400); };
const menu = async (p, item) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const ok = await q((item) => { const x = [...document.querySelectorAll('#nb-menu button')].find(k => k.textContent === item); if (x) x.click(); return !!x; }, item); await sleep(300); return ok; };
await q(async () => { window.R = MFS.make({ Work: { 'keep.html': '<main><h1>Keep</h1></main>', 'Untitled 1.html': '<main><h1>Old</h1></main>' }, 'c.md': '# C\n\nText `plain` here.\n\n| A | B |\n| --- | --- |\n| x | y |\n', 'raw.md': '# R\n\nKeys <kbd style="position:fixed">k</kbd> and <kbd>K</kbd>.\n' }, 'N'); await FLE.NB.openRoot(R, false, true); FLE.NB.toggle(true); }); await sleep(300);

// a new page with no H1
await menu('Work', 'New page here');
await q(() => { document.querySelector('#doc').innerHTML = '<h1><br></h1><p>Body text</p>'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(60);
await save();
check('a new page with no H1 is named Untitled and the first number free in its folder', (await paths()).includes('Work/Untitled 2.html'), await paths());
check('and its saved title is that name', /<title>Untitled 2<\/title>/.test(await text('Work/Untitled 2.html')));
await menu('Work', 'New page here');
await q(() => { document.querySelector('#doc').innerHTML = '<h1>Named</h1><p>x</p>'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(60);
await save();
check('one with an H1 is still named after it', (await paths()).includes('Work/Named.html'));

// Markdown: inline code, lists in table cells, raw HTML
await pg.click(row('c.md')); await sleep(400);
await q(() => { const c = document.querySelector('#doc code'); c.innerHTML = 'pl<b>ai</b>n'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(60);
let d0 = dialogs.length; await save();
same('inline code with formatting inside is saved as plain code, and that is named first', [/Text `plain` here\./.test(await text('c.md')), dialogs.length === d0 + 1 && /inline code with formatting inside \(saved as plain code\)/.test(dialogs[d0] || '')], [true, true]);
await q(() => { const td = document.querySelector('#doc td'), r = document.createRange(); r.selectNodeContents(td); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); document.dispatchEvent(new Event('selectionchange')); }); await sleep(120);
same('in a table cell the list buttons are dimmed', await q(() => ['ul', 'ol', 'check'].map(a => document.querySelector('#tbar [data-a="' + a + '"]').classList.contains('dim'))), [true, true, true]);
const cell0 = await q(() => document.querySelector('#doc td').innerHTML);
await q(() => document.querySelector('#chrome [data-a="ul"]').click()); await sleep(120);
same('and do nothing there', await q(() => document.querySelector('#doc td').innerHTML), cell0);
await pg.click(row('raw.md')); await sleep(400);
same('raw HTML is shown without its attributes', await q(() => [...document.querySelectorAll('#doc kbd')].map(k => k.outerHTML)), ['<kbd>k</kbd>', '<kbd>K</kbd>']);
check('and HTML with attributes is named as not kept', await q(() => FLE.NB.MD.lost(document.querySelector('#doc'), FLE.NB.state.cur ? FLE.NB.state.cur.meta : null).some(x => /HTML written inside the file/.test(x))) || await q(() => FLE.NB.MD.read('<kbd style="x">k</kbd>\n').rawHtml));
same('a code block of blank lines is written as an empty code block', await q(() => { const M = FLE.NB.MD, d = document.createElement('div'); d.innerHTML = '<pre><br><br></pre>'; return M.write(d, { style: { bullet: '-', em: '*', strong: '**' }, fm: '', gap: '' }); }), '```\n```\n');

// independent parsers
await q(async () => { window.R2 = MFS.make({ 'f.md': '# T\n' }, 'M'); await FLE.NB.openRoot(R2, false, true); }); await sleep(200);
await q(() => document.querySelector('.nb-row[title="f.md"]').click()); await sleep(400);
await q(() => { const M = FLE.NB.MD, w = M.write; window.__W = []; M.write = function (...a) { const s = w.apply(this, a); window.__W.push(s); return s; }; });
await matrix(pg, 'md');
const W = [...new Set(await q(() => window.__W))];
const norm = h => h.replace(/ ?\/>/g, '>').replace(/<input[^>]*>/g, '[box]').replace(/ (class|start|align|disabled|checked|type)="[^"]*"/g, '').replace(/ (disabled|checked)(?=[ >])/g, '').replace(/\s+/g, ' ').replace(/> </g, '><').replace(/ </g, '<').replace(/> /g, '>').replace(/&quot;/g, '"').replace(/&#39;|&#x27;/g, "'").trim();
const differ = W.filter(md => norm(micromark(md, { extensions: [gfm()], htmlExtensions: [gfmHtml()], allowDangerousHtml: true })) !== norm(marked.parse(md, { gfm: true })));
check('every Markdown file the structure tests write (' + W.length + ') reads the same in micromark with GFM as in marked', W.length > 50 && !differ.length, differ.slice(0, 2));
same('no errors in the page', errors, []);
await b.close();
