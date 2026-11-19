// Toolbar inserts go where the cursor is. A code block, table, box or diagram replaces an empty paragraph, and with the
// cursor inside a paragraph goes before it, after it or between its halves. The Q&A button works on the block the cursor
// is in: it becomes a question, and a question or answer goes back to a paragraph.
import { open, check, same, caretIn, sleep, load, click } from './harness.mjs';
const { b, pg, errors } = await open({ prompt: '2,1' });
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const kids = () => pg.evaluate(() => [...document.getElementById('doc').children].slice(1).map(c => { const t = c.matches('div.tw') ? 'TABLE' : c.matches('.box') ? 'BOX' : c.matches('.dg,.fig') ? 'DIAGRAM' : c.tagName + (c.className ? '.' + c.className : ''); return c.matches('div.tw,.dg,.fig') ? t : t + ':' + c.textContent; }));
const at = (sel, off) => pg.evaluate((sel, off) => { const e = document.querySelector(sel), r = document.createRange(); r.setStart(e.firstChild, off); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel, off);
const pick = (a, ao, z, zo) => pg.evaluate((a, ao, z, zo) => { const r = document.createRange(); r.setStart(document.querySelector(a).firstChild, ao); r.setEnd(document.querySelector(z).firstChild, zo); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, a, ao, z, zo);
const inTag = () => pg.evaluate(() => { let n = getSelection().anchorNode; if (n.nodeType !== 1) n = n.parentElement; return n.closest('pre,dt,dd,td,th,.box,p,li').tagName; });
const qaBtn = () => pg.evaluate(() => { const x = document.querySelector('[data-a="qa"]'); return [x.classList.contains('on'), x.classList.contains('dim')]; });
const doc = (h) => load(pg, '<main><h1>T</h1>' + h + '</main>');
const THREE = '<p id="a">Alpha</p><p id="m"><br></p><p id="z">Zed</p>', TWO = '<p id="a">Alpha beta</p><p id="z">Zed</p>';

// code block
await doc(THREE); await caretIn(pg, '#m'); await click(pg, 'code'); await sleep(80);
same('a code block takes the place of an empty paragraph', [await kids(), await inTag()], [['P:Alpha', 'PRE:', 'P:Zed'], 'PRE']);
await doc(TWO); await at('#a', 5); await click(pg, 'code'); await sleep(80); await K.type('x'); await sleep(40);
same('with the cursor inside a paragraph it goes between the two halves', await kids(), ['P:Alpha', 'PRE:x', 'P: beta', 'P:Zed']);
await doc(TWO); await caretIn(pg, '#a'); await click(pg, 'code'); await sleep(80);
same('at the end of a paragraph it goes after it', await kids(), ['P:Alpha beta', 'PRE:', 'P:Zed']);
await doc(TWO); await caretIn(pg, '#a', false); await click(pg, 'code'); await sleep(80);
same('at the start of a paragraph it goes before it', await kids(), ['PRE:', 'P:Alpha beta', 'P:Zed']);
await sleep(450); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes it out', await kids(), ['P:Alpha beta', 'P:Zed']);
await doc('<h3 id="h">Head line</h3><p id="z">Zed</p>'); await at('#doc h3', 4); await click(pg, 'code'); await sleep(80);
same('a heading is split the same way, and both halves stay headings', await kids(), ['H3:Head', 'PRE:', 'H3: line', 'P:Zed']);
check('each with its own link target', await pg.evaluate(() => { const ids = [...document.querySelectorAll('#doc h3')].map(h => h.id); return ids.length === 2 && ids[0] !== ids[1]; }));
await doc('<p class="sub" id="s">Subtitle</p><p id="z">Zed</p>'); await caretIn(pg, '#doc h1'); await click(pg, 'code'); await sleep(80);
same('from the title it goes after the subtitle, never between them', await kids(), ['P.sub:Subtitle', 'PRE:', 'P:Zed']);
await doc('<ul><li id="a">one</li><li>two</li></ul><p id="z">Zed</p>'); await caretIn(pg, '#a'); await click(pg, 'code'); await sleep(80);
same('a list cannot hold it: it goes after the list', await kids(), ['UL:onetwo', 'PRE:', 'P:Zed']);
await doc(TWO); await pick('#a', 2, '#a', 5); await click(pg, 'code'); await sleep(80);
same('with text selected nothing is split or removed: it goes after that block', await kids(), ['P:Alpha beta', 'PRE:', 'P:Zed']);

// table, box and diagram follow the same rule
await doc(THREE); await caretIn(pg, '#m'); await click(pg, 'table'); await sleep(120);
same('a table takes the place of an empty paragraph', (await kids()).slice(0, 2), ['P:Alpha', 'TABLE']);
await doc(TWO); await at('#a', 5); await click(pg, 'table'); await sleep(120);
same('and goes between the halves of a paragraph', (await kids()).filter(k => k !== 'P:'), ['P:Alpha', 'TABLE', 'P: beta', 'P:Zed']);
await doc(TWO); await at('#a', 5); await pg.select('#s-boxtype', 'tip'); await sleep(120);
same('a box goes between the halves of a paragraph', (await kids()).map(k => k.replace(/:.*/, '')), ['P', 'BOX', 'P', 'P']);
check('with the cursor in it', (await inTag()) === 'P' && await pg.evaluate(() => { let n = getSelection().anchorNode; if (n.nodeType !== 1) n = n.parentElement; return !!n.closest('.box'); }));
await doc(THREE); await caretIn(pg, '#m'); await pg.select('#s-boxtype', 'note'); await sleep(120);
same('and takes the place of an empty paragraph', (await kids()).map(k => k.replace(/:.*/, '')), ['P', 'BOX', 'P']);

// the Q&A button
await doc(THREE); await caretIn(pg, '#m'); await click(pg, 'qa'); await sleep(80); await K.type('Why?'); await sleep(40);
same('Q&A: an empty paragraph becomes the question, with nothing left behind', [await kids(), await inTag()], [['P:Alpha', 'DL.qa:Why?', 'P:Zed'], 'DT']);
same('the button is lit in a question', await qaBtn(), [true, false]);
await doc(TWO); await at('#a', 5); await click(pg, 'qa'); await sleep(80);
same('a paragraph with text becomes the question, text kept', [await kids(), await pg.evaluate(() => document.querySelector('#doc dl').innerHTML)], [['DL.qa:Alpha beta', 'P:Zed'], '<dt>Alpha beta</dt>']);
await click(pg, 'qa'); await sleep(80);
same('the button again makes it a paragraph', await kids(), ['P:Alpha beta', 'P:Zed']);
await doc(TWO); await pick('#a', 2, '#a', 5); await click(pg, 'qa'); await sleep(80);
same('with part of a paragraph selected, the paragraph becomes the question', await kids(), ['DL.qa:Alpha beta', 'P:Zed']);
await doc('<p id="a">One?</p><p id="m">Two?</p><p id="z">Three?</p><p>after</p>'); await pick('#a', 1, '#z', 2); await click(pg, 'qa'); await sleep(80);
same('several selected paragraphs become a question each, in one list', [await kids(), await pg.evaluate(() => document.querySelector('#doc dl').innerHTML)], [['DL.qa:One?Two?Three?', 'P:after'], '<dt>One?</dt><dt>Two?</dt><dt>Three?</dt>']);
await doc('<dl class="qa"><dt id="q">Q</dt><dd id="an">A</dd></dl><p id="z">Zed</p>'); await caretIn(pg, '#z'); await click(pg, 'qa'); await sleep(80);
same('a paragraph right under a Q&A list joins that list', [await kids(), await pg.evaluate(() => document.querySelectorAll('#doc dl').length)], [['DL.qa:QAZed'], 1]);
await doc('<dl class="qa"><dt id="q">Q</dt><dd id="an">A</dd><dt>Q2</dt></dl><p id="z">Zed</p>'); await caretIn(pg, '#an'); await click(pg, 'qa'); await sleep(80);
same('in an answer the button takes that item out as a paragraph; no second list is added under it', await kids(), ['DL.qa:Q', 'P:A', 'DL.qa:Q2', 'P:Zed']);
await doc('<ul><li id="a">one</li></ul><div class="tw"><table><tbody><tr><td id="c">cell</td></tr></tbody></table></div><p id="z">Zed</p>'); await caretIn(pg, '#a'); await sleep(60);
same('in a list item the button is dimmed', await qaBtn(), [false, true]);
await click(pg, 'qa'); await sleep(80);
same('and does nothing', await kids(), ['UL:one', 'TABLE', 'P:Zed']);
await caretIn(pg, '#c'); await sleep(60); const dimCell = await qaBtn(); await click(pg, 'qa'); await sleep(80);
same('the same in a table cell', [dimCell, await kids()], [[false, true], ['UL:one', 'TABLE', 'P:Zed']]);
await doc('<div class="box box-note" role="note"><p class="box-h">Note</p><p id="a">in box</p></div><p id="z">Zed</p>'); await caretIn(pg, '#a'); await click(pg, 'qa'); await sleep(80);
check('in a box the paragraph becomes a question inside the box', await pg.evaluate(() => document.querySelector('#doc .box').innerHTML === '<p class="box-h">Note</p><dl class="qa"><dt>in box</dt></dl>'), await pg.evaluate(() => document.querySelector('#doc .box').innerHTML));
await doc(TWO); await caretIn(pg, '#a'); await click(pg, 'qa'); await sleep(500); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo puts the paragraph back', await kids(), ['P:Alpha beta', 'P:Zed']);
await doc(TWO); await caretIn(pg, '#a'); await click(pg, 'qa'); await sleep(80); await caretIn(pg, '#z'); await click(pg, 'repeat'); await sleep(80); await click(pg, 'repeat'); await sleep(80);
same('Repeat makes the next paragraph a question, and sets rather than toggles', await kids(), ['DL.qa:Alpha betaZed']);
check('the toolbar is still one row with Help at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return t.right - h.right < 20 && h.top - t.top < 20; }));
same('no page errors', errors, []);
await b.close();
