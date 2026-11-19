// Clear format keeps the selection, so the next toolbar choice (a style, bold, a list) applies to the same text.
import { open, check, same, caretIn, sleep, load, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><h3>Head <b>three</b></h3><p class="bluf" id="lead">Lead <b>bold</b> and <i>italic</i> text</p><p id="p">Plain <b>bold</b> <span class="id">ID-1</span> <a href="https://example.com/">link</a> end</p>'
  + '<ul><li id="l1"><b>one</b></li><li id="l2">two <i>it</i></li></ul><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="td"><b>cell</b> text</td></tr></tbody></table></div><p id="e">End</p></main>';
const sel = () => pg.evaluate(() => { const s = getSelection(); return [s.isCollapsed, s.toString().replace(/\s+/g, ' ').trim()]; });
const whole = (q) => pg.evaluate((q) => { const r = document.createRange(); r.selectNodeContents(document.querySelector(q)); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, q);
const span = (a, z) => pg.evaluate((a, z) => { const first = n => { while (n.firstChild) n = n.firstChild; return n; }, last = n => { while (n.lastChild) n = n.lastChild; return n; }; const r = document.createRange(), x = first(document.querySelector(a)), y = last(document.querySelector(z)); r.setStart(x, 0); r.setEnd(y, y.nodeType === 3 ? y.length : 0); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, a, z);
const tags = () => pg.evaluate(() => [...document.getElementById('doc').children].map(c => c.tagName + (c.className ? '.' + c.className : '')).join(' '));

await load(pg, DOC); await whole('#lead'); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('a whole styled paragraph: cleared, and still selected', [await pg.evaluate(() => document.querySelector('#doc h3 + p').outerHTML), await sel()], ['<p>Lead bold and italic text</p>', [false, 'Lead bold and italic text']]);
await pg.select('#s-block', 'h3'); await sleep(100);
check('so a style chosen next applies to it', await pg.evaluate(() => [...document.querySelectorAll('#doc h3')].some(h => h.textContent === 'Lead bold and italic text')), await tags());
same('and it is still selected after that', (await sel())[1], 'Lead bold and italic text');

await load(pg, DOC); await span('#doc h3', '#lead'); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('several blocks: all cleared and all still selected', [await pg.evaluate(() => [...document.getElementById('doc').children].slice(1, 3).map(c => c.outerHTML)), await sel()], [['<p>Head three</p>', '<p>Lead bold and italic text</p>'], [false, 'Head three Lead bold and italic text']]);
await click(pg, 'ul'); await sleep(100);
check('so a list made next takes them all', await pg.evaluate(() => { const l = document.querySelector('#doc ul'); return l.children.length === 2 && l.children[0].textContent === 'Head three'; }), await tags());

await load(pg, DOC); await pg.evaluate(() => { const p = document.querySelector('#p'), r = document.createRange(); r.setStart(p.firstChild, 2); r.setEnd(p.querySelector('b').firstChild, 3); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('part of a paragraph: that part is cleared and stays selected', [await pg.evaluate(() => document.querySelector('#p').innerHTML.slice(0, 17)), await sel()], ['Plain bol<b>d</b>', [false, 'ain bol']]);
await load(pg, DOC); await whole('#p'); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('links and ID tags stay, and the paragraph stays selected', [await pg.evaluate(() => document.querySelector('#lead + p').innerHTML), (await sel())[1]], ['Plain bold <span class="id">ID-1</span> <a href="https://example.com/">link</a> end', 'Plain bold ID-1 link end']);
await load(pg, DOC); await span('#l1', '#l2'); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('list items: cleared and still selected', [await pg.evaluate(() => document.querySelector('#doc ul').innerHTML.replace(/ id="[^"]*"/g, '')), await sel()], ['<li>one</li><li>two it</li>', [false, 'one two it']]);
await load(pg, DOC); await whole('#td'); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('a table cell: cleared and still selected', [await pg.evaluate(() => document.querySelector('#td').innerHTML), await sel()], ['cell text', [false, 'cell text']]);
await click(pg, 'bold'); await sleep(100);
same('so Bold next applies to it', await pg.evaluate(() => document.querySelector('#td').innerHTML), '<b>cell text</b>');
await load(pg, DOC); await whole('#lead'); await sleep(60); await click(pg, 'clear'); await sleep(500); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
check('undo puts the formatting back', await pg.evaluate(() => !!document.querySelector('#doc p.bluf b')));
await load(pg, DOC); await caretIn(pg, '#lead'); await sleep(60); await click(pg, 'clear'); await sleep(100);
same('with the cursor only, there is still just a cursor', [(await sel())[0], await pg.evaluate(() => document.querySelector('#doc h3 + p').outerHTML)], [true, '<p>Lead bold and italic text</p>']);
check('nothing is left behind in the document', await pg.evaluate(() => { const w = document.createTreeWalker(document.getElementById('doc'), NodeFilter.SHOW_COMMENT); return !w.nextNode(); }));
same('no page errors', errors, []);
await b.close();
