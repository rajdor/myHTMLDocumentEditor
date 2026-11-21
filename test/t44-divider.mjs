// Divider: the toolbar puts a horizontal line where the cursor is, like the other inserts, and typing carries on after it.
// It is saved, reopened, copied and pasted, kept when pasted from other programs, removed with Delete, repeated with
// Repeat and undone in one step. In the notebook a Markdown file saves it as ---.
import { open, check, same, load, sleep, caretIn, click, IS_NOTEBOOK } from './harness.mjs';
const { b, pg, errors } = await open();
const q = (f, ...a) => pg.evaluate(f, ...a);
const kids = () => q(() => [...document.querySelector('#doc').children].map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (e.tagName === 'P' && !e.id ? ':' + e.textContent : '')));
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
await load(pg, '<main><h1>T</h1><p id="a">one two</p><p id="b">last</p></main>');

await caretIn(pg, '#a', true); await click(pg, 'divider'); await sleep(80);
same('at the end of a paragraph the line goes after it, with an empty paragraph to type in', await kids(), ['h1', 'p#a', 'hr', 'p:', 'p#b']);
await pg.keyboard.type('typed'); await sleep(50);
same('typing carries on after the line', await kids(), ['h1', 'p#a', 'hr', 'p:typed', 'p#b']);
await caretIn(pg, '#b', false); await click(pg, 'divider'); await sleep(80);
same('at the start of a paragraph it goes before it, and the cursor stays in that paragraph', [await kids(), await q(() => { const n = getSelection().anchorNode; return (n.nodeType === 1 ? n : n.parentElement).closest('p').id; })], [['h1', 'p#a', 'hr', 'p:typed', 'hr', 'p#b'], 'b']);
await q(() => { const n = document.querySelector('#a').firstChild, r = document.createRange(); r.setStart(n, 4); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); }); await sleep(40);
await click(pg, 'divider'); await sleep(80);
same('in the middle of a paragraph it splits it', (await kids()).slice(0, 4), ['h1', 'p#a', 'hr', 'p:two']);
check('the line is drawn: a thin solid line in the light blue-grey', await q(() => { const s = getComputedStyle(document.querySelector('#doc hr')); return s.borderTopStyle === 'solid' && parseFloat(s.borderTopWidth) >= 1 && s.borderTopColor === 'rgb(207, 219, 232)'; }));
await pg.keyboard.down('Alt'); await pg.keyboard.press('KeyQ'); await pg.keyboard.up('Alt'); await sleep(80);
same('Repeat puts in another', await q(() => document.querySelectorAll('#doc hr').length), 4);
await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(120);
same('one undo takes one out', await q(() => document.querySelectorAll('#doc hr').length), 3);
check('the help mentions it, and the toolbar is still one row', await q(() => /Divider/.test(document.querySelector('#help').textContent)) && await q(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return h.top - t.top < 20; }));

/* deleting it */
await q(() => { const hr = document.querySelector('#doc hr'), p = hr.previousElementSibling, r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); }); await sleep(40);
await pg.keyboard.press('Delete'); await sleep(80);
same('Delete at the end of the paragraph before it removes it', await q(() => document.querySelectorAll('#doc hr').length), 2);

/* saved, reopened, pasted */
const out = await q(() => FLE.build());
same('the saved page holds the lines as plain hr elements', (out.match(/<hr>/g) || []).length, 2);
await q((o) => FLE.load(o, 'x.html'), out); await sleep(200);
same('and they come back on reopening', await q(() => document.querySelectorAll('#doc hr').length), 2);
await caretIn(pg, '#doc p:last-child', true);
await q(() => { const dt = new DataTransfer(); dt.setData('text/html', '<html><body><p style="color:red">Before</p><hr style="border:3px dotted red" class="x"><p>After</p></body></html>'); dt.setData('text/plain', 'Before\n---\nAfter'); document.querySelector('#doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }); await sleep(120);
check('a line pasted from another program is kept, without its own styling', await q(() => { const h = [...document.querySelectorAll('#doc hr')]; const p = h.find(x => x.previousElementSibling && x.previousElementSibling.textContent === 'Before'); return h.length === 3 && !!p && !p.hasAttribute('style') && !p.hasAttribute('class') && p.nextElementSibling.textContent === 'After'; }));
await load(pg, '<main><h1>T</h1><table><tr><td id="c">cell</td></tr></table><p id="d">x</p></main>');
await caretIn(pg, '#c', true); await click(pg, 'divider'); await sleep(80);
same('from a table cell the line goes after the table, as other inserts do, with a paragraph to type in', await kids(), ['h1', 'table', 'hr', 'p:', 'p#d']);

if (IS_NOTEBOOK) {
  const { installMockFs } = await import('./mockfs.mjs');
  await q(installMockFs);
  await q(async () => { window.R = MFS.make({ 'n.md': '# N\n\nOne.\n\nTwo.\n' }, 'M'); await FLE.NB.openRoot(R, false, true); FLE.NB.toggle(true); }); await sleep(300);
  await pg.click('.nb-row[title="n.md"]'); await sleep(300);
  if (await q(() => document.querySelector('#nb-ask').open)) { await pg.click('#nb-ask button[value="discard"]'); await sleep(300); }
  check('the Divider button works in a Markdown file', await q(() => !document.querySelector('[data-a="divider"]').disabled));
  await q(() => { const p = document.querySelectorAll('#doc p')[0], r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); }); await sleep(40);
  await click(pg, 'divider'); await sleep(80); await click(pg, 'save'); await sleep(400);
  same('and a Markdown file saves it as ---', await q(() => MFS.text(R, 'n.md')), '# N\n\nOne.\n\n---\n\nTwo.\n');
}
same('no page errors', errors, []);
await b.close();
