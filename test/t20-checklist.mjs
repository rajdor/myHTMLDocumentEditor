// Checklists: a bulleted list whose items start with a real checkbox. Made and removed from the toolbar, ticked by a
// click, saved with the document, and usable in the saved file with scripts switched off.
import { open, check, same, caretIn, sleep, load, click, ROOT } from './harness.mjs';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const html = (s = '#doc') => pg.evaluate(s => document.querySelector(s).innerHTML, s);
const DOC = '<main><h1>T</h1><p id="a">First</p><h2>S</h2><ul id="l"><li>one</li><li>two</li></ul><ol id="o"><li>n1</li></ol><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="cell">c1</td></tr></tbody></table></div><p id="z">Zed</p></main>';
const BOX = '<input type="checkbox">', ON = '<input type="checkbox" checked="">';

await load(pg, DOC);
// make a checklist from a paragraph, type, Enter for the next item
await pg.evaluate(() => { const t = document.querySelector('#a').firstChild, r = document.createRange(); r.setStart(t, t.length); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }); await sleep(30); await click(pg, 'check'); await sleep(50);
same('Checklist turns a paragraph into a checklist item with a box', await pg.evaluate(() => document.querySelector('#doc ul.check').outerHTML), '<ul class="check"><li>' + BOX + 'First</li></ul>');
check('the Checklist button is lit and Bullet list is not', await pg.evaluate(() => document.querySelector('[data-a="check"]').classList.contains('on') && !document.querySelector('[data-a="ul"]').classList.contains('on')));
check('the new list is not left inside the paragraph it came from', await pg.evaluate(() => !document.querySelector('#doc p ul, #doc p ol')));
await K.press('Enter'); await K.type('Second'); await sleep(50);
same('Enter starts a new item with its own box', await html('#doc ul.check'), '<li>' + BOX + 'First</li><li>' + BOX + 'Second</li>');
// tick by a click; the tick is in the HTML, and undo takes it back
const boxAt = (i) => pg.evaluate(i => { const r = document.querySelectorAll('#doc ul.check input')[i].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, i);
await pg.mouse.click(...await boxAt(0)); await sleep(80);
same('a click ticks the box and writes it to the document', await html('#doc ul.check'), '<li>' + ON + 'First</li><li>' + BOX + 'Second</li>');
check('the ticked box shows as ticked', await pg.evaluate(() => document.querySelector('#doc ul.check input').checked));
check('ticking leaves the cursor in the text', await pg.evaluate(() => { const n = getSelection().anchorNode; return !!n && n.nodeName !== 'INPUT' && document.getElementById('doc').contains(n); }));
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(100);
check('undo takes the tick back', !(await html('#doc ul.check')).includes('checked'));
await pg.mouse.click(...await boxAt(1)); await sleep(80);
await pg.mouse.click(...await boxAt(1)); await sleep(80);
check('a second click clears the tick', !(await html('#doc ul.check')).includes('checked'));
await pg.mouse.click(...await boxAt(1)); await sleep(500);
// saved with the document, with no script, and back again on open
const saved = await pg.evaluate(() => FLE.build());
check('the saved document carries the tick, and each box is named by its item for screen readers', saved.includes('<li><input type="checkbox" aria-label="First">First</li><li><input type="checkbox" checked="" aria-label="Second">Second</li>'), saved.slice(saved.indexOf('<ul class="check"'), saved.indexOf('<ul class="check"') + 200));
check('the saved document has no script', !/<script/i.test(saved));
await load(pg, saved);
same('a saved checklist opens unchanged, without the names, which are made again at each save', await html('#doc ul.check'), '<li>' + BOX + 'First</li><li>' + ON + 'Second</li>');
// the saved file on its own, scripts switched off: boxes sit in the bullet's place and can be ticked
const out = path.join(ROOT, 'test', 'out', 'checklist-saved.html'); fs.writeFileSync(out, saved);
const p2 = await b.newPage(); await p2.setJavaScriptEnabled(false); await p2.goto(pathToFileURL(out).href);
const g = await p2.$eval('ul.check', u => { const i = u.querySelector('input').getBoundingClientRect(), l = u.querySelector('li').getBoundingClientRect(); return { left: i.right <= l.left, inLine: i.top >= l.top && i.bottom <= l.bottom + 1, marker: getComputedStyle(u).listStyleType }; });
check('in the saved file the box sits where the bullet was, on the first line', g.left && g.inLine && g.marker === 'none', g);
await p2.click('ul.check li:first-child input');
check('with scripts off, a reader can tick a box in the saved file', await p2.$eval('ul.check li:first-child input', i => i.matches(':checked')));
await p2.screenshot({ path: path.join(ROOT, 'test', 'out', 'checklist-saved.png'), clip: { x: 0, y: 0, width: 900, height: 420 } });
await p2.close();

// Backspace at the start of an item takes it out of the list
await load(pg, '<main><h1>T</h1><ul class="check"><li>' + BOX + 'one</li><li>' + BOX + 'two</li></ul><p id="z">Zed</p></main>');
await pg.evaluate(() => { const li = document.querySelectorAll('#doc ul.check li')[1]; const r = document.createRange(); r.setStart(li.lastChild, 0); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('doc').focus(); });
await K.press('Backspace'); await sleep(80);
const afterBs = await pg.evaluate(() => ({ items: document.querySelectorAll('#doc ul.check li').length, boxes: document.querySelectorAll('#doc input').length, text: document.getElementById('doc').textContent }));
check('Backspace at the start of an item takes it out of the checklist, text kept', afterBs.items === 1 && afterBs.boxes === 1 && afterBs.text.includes('two'), afterBs);
// Bullet list on a checklist makes plain bullets; Checklist on bullets makes a checklist; Checklist again removes the list
await load(pg, DOC);
await caretIn(pg, '#l li'); await click(pg, 'check'); await sleep(50);
same('Checklist turns a bulleted list into a checklist', await html('#l'), '<li>' + BOX + 'one</li><li>' + BOX + 'two</li>');
await click(pg, 'ul'); await sleep(50);
same('Bullet list turns a checklist back into bullets, boxes gone', await pg.evaluate(() => document.querySelector('#l').outerHTML), '<ul id="l"><li>one</li><li>two</li></ul>');
await caretIn(pg, '#l li'); await click(pg, 'check'); await sleep(50); await click(pg, 'check'); await sleep(50);
check('Checklist on a checklist item takes it out of the list, no box left behind', await pg.evaluate(() => document.querySelectorAll('#doc input').length === 1 && document.querySelectorAll('#l li, #doc ul.check li').length === 1), await html());
await caretIn(pg, '#o li'); await click(pg, 'check'); await sleep(50);
check('Checklist turns a numbered item into a checklist item', await pg.evaluate(() => { const li = [...document.querySelectorAll('#doc ul.check li')].find(l => l.textContent === 'n1'); return !!li && li.firstChild.nodeName === 'INPUT'; }), await html());
// in a table cell
await caretIn(pg, '#cell'); await click(pg, 'check'); await sleep(50);
same('a checklist works in a table cell', await html('#cell'), '<ul class="check"><li>' + BOX + 'c1</li></ul>');
// opening a document: only a checklist's own boxes are kept, and only as plain checkboxes
await load(pg, '<main><h1>T</h1><p id="p">x<input type="text" value="v"><input type="checkbox"></p><ul class="check"><li><input type="checkbox" checked name="n" onclick="x()" id="q">a<input type="checkbox"></li><li>b</li></ul><ol class="check"><li>c</li></ol></main>');
same('other form fields are removed on open; checklist boxes are reduced to a plain checkbox, one per item', await pg.evaluate(() => [document.querySelector('#p').innerHTML, document.querySelector('#doc ul.check').innerHTML, document.querySelector('#doc ol').outerHTML]), ['x', '<li>' + ON + 'a</li><li>' + BOX + 'b</li>', '<ol><li>c</li></ol>']);
// copy and paste
const copy = () => pg.evaluate(() => { const dt = new DataTransfer(); document.getElementById('doc').dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/html'); });
const paste = (h) => pg.evaluate((h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', ''); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h);
await load(pg, '<main><h1>T</h1><ul class="check"><li>' + ON + 'one</li><li>' + BOX + 'two</li></ul><p id="e"><br></p><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="cell">c1</td></tr></tbody></table></div></main>');
await pg.evaluate(() => { const u = document.querySelector('#doc ul.check'); const r = document.createRange(); r.setStart(u.firstChild.lastChild, 0); r.setEnd(u.lastChild.lastChild, 3); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
const clip = await copy();
await caretIn(pg, '#e'); await paste(clip); await sleep(80);
same('a copied checklist pastes as a checklist with its ticks', await pg.evaluate(() => [...document.querySelectorAll('#doc ul.check')].map(u => u.innerHTML)), ['<li>' + ON + 'one</li><li>' + BOX + 'two</li>', '<li>' + ON + 'one</li><li>' + BOX + 'two</li>']);
await caretIn(pg, '#cell'); await paste(clip); await sleep(80);
same('pasted into plain cell text, checklist items become lines with no stray boxes', await html('#cell'), 'c1one<br>two');
// repeat last command sets a checklist
await load(pg, DOC); await caretIn(pg, '#a'); await click(pg, 'check'); await sleep(50); await caretIn(pg, '#z'); await click(pg, 'repeat'); await sleep(80);
check('Repeat applies Checklist again', await pg.evaluate(() => { const z = document.querySelector('#doc ul.check:last-of-type li') ; return [...document.querySelectorAll('#doc ul.check li')].some(l => l.textContent === 'Zed' && l.firstChild.nodeName === 'INPUT'); }), await html());
same('no page errors', errors, []);
await b.close();
