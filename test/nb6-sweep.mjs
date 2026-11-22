// Fixes and additions from the review sweep: Show blocks ends when another kind of file opens; unsafe links in Markdown
// are named before saving; the browser draft is for pages only; history copies of text and Markdown files are their
// bytes; Option+Q types in the text editor; diagrams keep their look in a Markdown file; pictures from the notebook
// folder are shown in Markdown and saved with their path; the text editor follows a file's indentation; printing.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
const { b, pg, errors, dialogs } = await open();
await pg.evaluate(installMockFs);
const q = (f, ...a) => pg.evaluate(f, ...a);
const row = (p) => '.nb-row[title="' + p + '"]';
const clickRow = async (p) => { await pg.click(row(p)); await sleep(350); if (await q(() => document.querySelector('#nb-ask').open)) { await pg.click('#nb-ask button[value="discard"]'); await sleep(300); } };
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(400); };
const touch = async () => { await q(() => document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true }))); await sleep(450); };
const PNG = [137, 80, 78, 71, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, 0, 0, 0, 13, 73, 68, 65, 84, 120, 156, 99, 248, 207, 192, 240, 31, 0, 5, 0, 1, 255, 137, 153, 61, 29, 0, 0, 0, 0, 73, 69, 78, 68, 174, 66, 96, 130];
await q(async (PNG) => {
  FLE.load('<main><h1>P</h1><div class="wrap"><p>in a div</p></div></main>'); const P = FLE.build();
  window.R = MFS.make({ 'p.html': P, 'unsafe.md': '# U\n\n[x](javascript:alert(1)) and [y](https://e.com)\n', 'crlf.txt': 'one\r\ntwo\r\n',
    docs: { 'pics.md': '# Pics\n\n![Local](img/dot.png)\n\n![Up](../top.png "Top one")\n\n![Gone](img/missing.png)\n\n![Web](https://example.com/w.png)\n' },
    'tabs.py': 'def f():\n\treturn 1\n', 'four.json': '{\n    "a": {\n        "b": 1\n    }\n}\n', 'two.yaml': 'a:\n  b:\n    c: 1\n', 'none.ps1': 'Write-Host hi\n', 'big.txt': Array.from({ length: 300 }, (_, i) => 'line ' + (i + 1)).join('\n') + '\n' }, 'Sweep');
  MFS.putBytes(R, 'docs/img/dot.png', PNG); MFS.putBytes(R, 'top.png', PNG);
  await FLE.NB.openRoot(R, false, true); FLE.NB.toggle(true);
}, PNG);
await sleep(300);

/* Show blocks */
await clickRow('p.html'); await pg.click('#chrome button[data-a="blocks"]'); await sleep(100);
check('Show blocks is on for a page', await q(() => document.querySelector('#doc').classList.contains('ed-blocks')));
await clickRow('unsafe.md');
check('opening a Markdown file turns it off: no outlines, no bar', await q(() => !document.querySelector('#doc').classList.contains('ed-blocks') && document.querySelector('#cbar').hidden && document.querySelector('[data-a="blocks"]').getAttribute('aria-pressed') === 'false'));

/* unsafe links; draft */
await q(() => localStorage.removeItem('fln-draft')); await touch();
same('a Markdown file leaves no browser draft behind', await q(() => localStorage.getItem('fln-draft')), null);
let d0 = dialogs.length; await save();
check('a link to a javascript: address is named before the save', dialogs.length === d0 + 1 && /1 link to an address that is not allowed, such as javascript:, \(saved as plain text\)/.test(dialogs[d0]), dialogs.slice(d0));
await clickRow('p.html'); await q(() => { document.querySelector('#doc p').textContent = 'changed'; }); await touch();
check('a page still leaves its draft', /changed/.test(await q(() => localStorage.getItem('fln-draft') || '')));

/* history copies keep the bytes */
await clickRow('crlf.txt'); await q(() => { const v = FLE.NB.TXT.view; v.dispatch({ changes: { from: v.state.doc.length, insert: 'x' } }); }); await sleep(50); await save();
const h = await q(() => MFS.paths(R).filter(p => /^\.history\/crlf\.txt\/.+\.txt$/.test(p)).map(p => MFS.bytes(R, p)));
same('the copy kept in history is the file as it was, CRLF and all', h, [[111, 110, 101, 13, 10, 116, 119, 111, 13, 10]]);
await q(() => { document.querySelector('[data-a="xwrap"]'); }); 
await pg.click(row('crlf.txt'), { button: 'right' }); await sleep(100); await q(() => [...document.querySelectorAll('#nb-menu button')].find(k => k.textContent === 'File history').click()); await sleep(300);
await q(() => document.querySelector('#nb-hist-list button').click()); await sleep(400);
same('and Restore reads it back as the file\'s text', await q(() => FLE.NB.TXT.content()), 'one\ntwo\n');
await save(); same('saving the restored copy writes the CRLF file again', await q(() => MFS.text(R, 'crlf.txt')), 'one\r\ntwo\r\n');

/* Option+Q in the text editor */
const handled = await q(() => { const e = new KeyboardEvent('keydown', { key: '\u0153', code: 'KeyQ', altKey: true, bubbles: true, cancelable: true }); document.querySelector('#tx .cm-content').dispatchEvent(e); return e.defaultPrevented; });
check('Option+Q is left to the text editor, so it can type a character', handled === false);

/* indentation */
const ind = {};
for (const f of ['tabs.py', 'four.json', 'two.yaml', 'none.ps1', 'crlf.txt']) { await clickRow(f); ind[f] = [await q(() => FLE.NB.TXT.info().indent), await q(() => /Tabs|spaces/.test(document.querySelector('#x-info').textContent))]; }
same('the text editor follows the indentation a file already uses, and says it in the bar', ind, { 'tabs.py': ['Tabs', true], 'four.json': ['4 spaces', true], 'two.yaml': ['2 spaces', true], 'none.ps1': ['4 spaces', true], 'crlf.txt': ['2 spaces', true] });
await clickRow('four.json'); await pg.click('#tx .cm-content'); await q(() => { const v = FLE.NB.TXT.view; v.dispatch({ selection: { anchor: v.state.doc.line(2).to } }); v.focus(); }); await pg.keyboard.press('Enter'); await sleep(60);
check('Enter indents a new line the way the file does', /\n {4}"a": \{\n {8}\n/.test(await q(() => FLE.NB.TXT.content())), await q(() => FLE.NB.TXT.content()));

/* printing a text file */
await clickRow('big.txt');
check('the toolbar has a Print button for every kind of file', await q(() => { const p = document.querySelector('[data-a="print"]'); return !!p && !!p.offsetParent; }));
await q(() => window.dispatchEvent(new Event('beforeprint'))); await pg.emulateMediaType('print'); await sleep(100);
const pr = await q(() => { const o = document.querySelector('#tx-print'); return { shown: getComputedStyle(o).display, lines: o.querySelectorAll('.txp-l').length, last: [...o.querySelectorAll('.txp-l')].pop().textContent, head: o.querySelector('.txp-h').textContent, tx: getComputedStyle(document.querySelector('#tx')).display, chrome: getComputedStyle(document.querySelector('#chrome')).display, nb: getComputedStyle(document.querySelector('#nb')).display, num: getComputedStyle(o.querySelector('.txp-l:last-child'), '::before').content }; });
same('printing a text file prints every line, numbered, without the editor, toolbar or panel', [pr.shown, pr.lines, pr.last, /^big\.txt {2}\| {2}Plain text {2}\| {2}301 lines/.test(pr.head), pr.tx, pr.chrome, pr.nb], ['block', 301, '\u200b', true, 'none', 'none', 'none']);
await pg.emulateMediaType(null); await q(() => window.dispatchEvent(new Event('afterprint')));
check('and the print copy is emptied afterwards', await q(() => document.querySelector('#tx-print').childElementCount === 0));
await clickRow('four.json'); await q(() => window.dispatchEvent(new Event('beforeprint')));
check('a JSON file prints coloured, as on screen', await q(() => { const sp = [...document.querySelectorAll('#tx-print .txp-l span')]; return sp.length >= 4 && new Set(sp.map(s => getComputedStyle(s).color)).size >= 2; }));
await q(() => window.dispatchEvent(new Event('afterprint')));

/* Markdown: diagrams, local pictures, printing */
await pg.click(row('docs')); await sleep(300); await clickRow('docs/pics.md');
const pics = await q(() => [...document.querySelectorAll('#doc img')].map(i => [i.getAttribute('alt'), i.getAttribute('data-md-src'), i.src.startsWith('blob:'), i.complete && i.naturalWidth === 1]));
same('pictures from the notebook folder are shown, here and one folder up', pics, [['Local', 'img/dot.png', true, true], ['Up', '../top.png', true, true]]);
check('a picture that is not found, or is on the web, stays a link card', await q(() => document.querySelectorAll('#doc a.link-card').length === 2));
await touch(); await save();
same('saving writes each picture back with the path it had', await q(() => MFS.text(R, 'docs/pics.md')), '# Pics\n\n![Local](img/dot.png)\n\n![Up](../top.png "Top one")\n\n![Gone](img/missing.png)\n\n![Web](https://example.com/w.png)\n');
await pg.click('#chrome button[data-a="xsrc"]'); await sleep(300); await pg.click('#chrome button[data-a="xsrc"]'); await sleep(400);
check('the pictures come back after switching to the source and back', await q(() => document.querySelectorAll('#doc img[data-md-src]').length === 2));
const copied = await q(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#doc')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); const e = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }); document.dispatchEvent(e); return e.clipboardData.getData('text/html'); });
check('a copied picture carries its path, not its blob: address', /src="img\/dot\.png"/.test(copied) && !/blob:/.test(copied));
await q(() => { document.querySelector('#doc').insertAdjacentHTML('beforeend', '<div class="dg" contenteditable="false"><svg viewBox="0 0 20 20" width="20" height="20"><rect id="rr" x="1" y="1" width="18" height="18" fill="#ff0000" stroke="#0000ff"/></svg></div>'); });
same('a diagram pasted into a Markdown file keeps its colours', await q(() => [getComputedStyle(document.querySelector('#rr')).fill, getComputedStyle(document.querySelector('#rr')).stroke]), ['rgb(255, 0, 0)', 'rgb(0, 0, 255)']);
await pg.emulateMediaType('print');
check('a Markdown file prints in its plain look, without the bar or the panel', await q(() => getComputedStyle(document.querySelector('#xbar')).display === 'none' && getComputedStyle(document.querySelector('#nb')).display === 'none' && /^system-ui/.test(getComputedStyle(document.querySelector('#doc')).fontFamily)));
await pg.emulateMediaType(null);
await clickRow('crlf.txt');
check('pictures shown from the folder are let go when another file opens', await q(() => [...document.querySelectorAll('img')].every(i => !i.src.startsWith('blob:'))));
/* two files clicked quickly: the later click wins, even when the earlier file is slower to read */
await q(async (PNG) => { MFS.put(R, 'slow.md', '# Slow\n\n![p](p.png)\n'); MFS.put(R, 'fast.json', '{}\n'); MFS.putBytes(R, 'p.png', PNG);
  const realGet = R.getFileHandle.bind(R); R.getFileHandle = async (n, o) => { const h = await realGet(n, o); if (n === 'p.png') { const g = h.getFile.bind(h); h.getFile = async () => { await new Promise(r => setTimeout(r, 600)); return g(); }; } return h; }; }, PNG);
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
await q(() => { document.querySelector('.nb-row[title="slow.md"]').click(); setTimeout(() => document.querySelector('.nb-row[title="fast.json"]').click(), 50); }); await sleep(1500);
same('when a slow file is overtaken, the file shown and the file saved are both the one clicked last', await q(() => [FLE.NB.state.cur.node, FLE.NB.kind, FLE.NB.TXT.content(), document.querySelector('#x-name').textContent, document.querySelectorAll('img[src^="blob:"]').length]), ['fast.json', 'text', '{}\n', 'fast.json', 0]);
same('no page errors', errors, []);
await b.close();
