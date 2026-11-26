// Boxes for the reader: Note, Information, Tip, Warning and Critical. A box holds whole blocks, which keep their own
// styles; its label starts as the type's name and can be retyped. A box is inserted empty from the Box list, then typed
// or pasted into, or the list puts the selected blocks in a new box; the list also changes a box's type, hides or shows
// its icon and removes it. (t51 has the icon and more of the selection.)
import { open, check, same, caretIn, sleep, load, click, ROOT } from './harness.mjs';
import path from 'path';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const html = (s = '#doc') => pg.evaluate(s => document.querySelector(s).innerHTML, s);
const outer = (s) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.outerHTML : null; }, s);
const boxAs = async (v) => { await pg.select('#s-boxtype', v); await sleep(60); };
const shown = () => pg.evaluate(() => document.querySelector('#s-boxtype').value);
const textCaret = (sel, at) => pg.evaluate((sel, at) => { const e = document.querySelector(sel), t = e.firstChild, r = document.createRange(); r.setStart(t, at === undefined ? t.length : at); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel, at);
const span = (a, b2) => pg.evaluate((a, b2) => { const x = document.querySelector(a), y = document.querySelector(b2), r = document.createRange(); r.setStart(x.firstChild, 1); r.setEnd(y.lastChild.nodeType === 3 ? y.lastChild : y, y.lastChild.nodeType === 3 ? 1 : y.childNodes.length); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, a, b2);
const DOC = '<main><h1 id="t">T</h1><p id="a">Alpha</p><h3 id="h">Head</h3><p class="bluf" id="lead">Lead</p><ul id="l"><li>one</li><li>two</li></ul><p id="z">Zed</p><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="cell">c1</td></tr></tbody></table></div><p id="e">End</p></main>';

await load(pg, DOC);
same('the Box list offers the five types, Hide icon and Remove box', await pg.evaluate(() => [...document.querySelector('#s-boxtype').options].map(o => o.textContent)), ['Box', 'Note', 'Information', 'Tip', 'Warning', 'Critical', 'Hide icon', 'Remove box']);
// insert an empty box after the current block; the cursor goes into it
await textCaret('#a'); await boxAs('warning');
same('the Box list inserts an empty box after the current block, with the type name as its label', await pg.evaluate(() => [...document.getElementById('doc').children].slice(1, 4).map(c => c.outerHTML)), ['<p id="a">Alpha</p>', '<div class="box box-warning" role="note"><p class="box-h">Warning</p><p><br></p></div>', '<h3 id="head">Head</h3>']);
check('existing text is not put in the box', await pg.evaluate(() => !document.querySelector('#doc .box #a')));
check('the cursor is in the new box, under the label', await pg.evaluate(() => { let n = getSelection().anchorNode; if (n.nodeType !== 1) n = n.parentElement; const p = n.closest('.box > p'); return !!p && !p.classList.contains('box-h'); }));
await K.type('Typed in'); await sleep(60);
same('typing goes into the box', await outer('#doc .box'), '<div class="box box-warning" role="note"><p class="box-h">Warning</p><p>Typed in</p></div>');
same('the Box list shows the type while the cursor is in the box', await shown(), 'warning');
await textCaret('#z'); await sleep(40); same('and shows nothing outside a box', await shown(), '');
await span('#doc h3', '#l li:last-child'); await boxAs('note');
check('a selection is boxed: the blocks it reaches go in the new box whole, in order, under the label', await pg.evaluate(() => { const bx = document.querySelector('#doc .box.box-note'); return !!bx && [...bx.children].map(c => c.tagName).join() === 'P,H3,P,UL' && bx.querySelector('.bluf').textContent === 'Lead' && bx.querySelectorAll('li').length === 2; }), await html());
await load(pg, '<main><h1>T</h1><p id="a">Alpha</p><p id="e"><br></p><p id="z">Zed</p></main>'); await caretIn(pg, '#e'); await boxAs('tip');
same('on an empty paragraph the box takes its place', await pg.evaluate(() => [...document.getElementById('doc').children].map(c => c.tagName + (c.className ? '.' + c.className.replace(/ /g, '.') : '') + ':' + c.textContent)), ['H1:T', 'P:Alpha', 'DIV.box.box-tip:Tip', 'P:Zed']);
await textCaret('#a'); await boxAs('warning');
// the look: bar, tint, coloured bold label with an icon
const look = await pg.evaluate(() => { const bx = document.querySelector('#doc .box'), h = bx.firstElementChild, c = getComputedStyle(bx), hc = getComputedStyle(h), ic = getComputedStyle(h, '::before'); return { bar: c.borderLeftWidth + ' ' + c.borderLeftColor, bg: c.backgroundColor, label: hc.color, weight: hc.fontWeight, icon: (ic.maskImage || ic.webkitMaskImage || '').slice(0, 24), iconBg: ic.backgroundColor }; });
check('a warning box has a 3px bar, a pale tint and a bold label with an icon, all in the warning colour', look.bar === '3px rgb(138, 83, 0)' && look.label === 'rgb(138, 83, 0)' && look.weight === '600' && look.icon.startsWith('url("data:image/svg+xml') && look.iconBg === 'rgb(138, 83, 0)' && !/255, 255, 255\)$/.test(look.bg) && look.bg !== 'rgba(0, 0, 0, 0)', look);
// pasting into a box: the blocks go in and keep their own styles
await load(pg, DOC); await textCaret('#a'); await boxAs('info');
await pg.evaluate((h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', ''); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, '<div data-fle-clip="1"><h3>Head</h3><p class="bluf" id="lead">Lead</p><ul><li>one</li><li>two</li></ul></div>'); await sleep(80);
same('blocks pasted into a box go in the box, each keeping its own style', await pg.evaluate(() => [...document.querySelector('#doc .box').children].map(c => c.tagName + (c.className ? '.' + c.className : '') + ':' + c.textContent).filter(t => t !== 'P:')), ['P.box-h:Information', 'H3:Head', 'P.bluf:Lead', 'UL:onetwo']);
check('and nothing else moves into it', await pg.evaluate(() => !document.querySelector('#doc .box #a') && !document.querySelector('#doc .box #z')));
// change the type: the label follows unless it was retyped
await textCaret('#doc .box .bluf'); await boxAs('tip');
same('choosing another type changes the box and its untouched label', await pg.evaluate(() => [document.querySelector('#doc .box').className, document.querySelector('#doc .box-h').textContent, document.querySelectorAll('#doc .box').length]), ['box box-tip', 'Tip', 1]);
await pg.evaluate(() => { const h = document.querySelector('#doc .box-h'), r = document.createRange(); r.selectNodeContents(h); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }); await K.type('Allergen tip'); await sleep(60);
same('the label can be retyped', await outer('#doc .box-h'), '<p class="box-h">Allergen tip</p>');
await textCaret('#doc .box .bluf'); await boxAs('critical');
same('a retyped label is kept when the type changes', await pg.evaluate(() => [document.querySelector('#doc .box').className, document.querySelector('#doc .box-h').textContent]), ['box box-critical', 'Allergen tip']);
// Enter: from the label into the box; an empty last line leaves it
await pg.evaluate(() => { const h = document.querySelector('#doc .box-h'), r = document.createRange(); r.selectNodeContents(h); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await K.press('Enter'); await K.type('First'); await sleep(60);
same('Enter in the label starts a plain paragraph inside the box', await pg.evaluate(() => [...document.querySelector('#doc .box').children].slice(0, 3).map(c => c.tagName + (c.className ? '.' + c.className : '') + ':' + c.textContent)), ['P.box-h:Allergen tip', 'P:First', 'H3:Head']);
await K.press('Enter'); await K.type('Second'); await sleep(60);
check('Enter in the box stays in the box', await pg.evaluate(() => { const p = [...document.querySelectorAll('#doc .box > p')].find(x => x.textContent === 'Second'); return !!p && !p.className; }));
await load(pg, '<main><h1>T</h1><div class="box box-note" role="note"><p class="box-h">Note</p><p id="a">Alpha</p></div><p id="z">Zed</p></main>');
await textCaret('#a'); await K.press('Enter'); await K.press('Enter'); await K.type('Out'); await sleep(60);
same('Enter on an empty last line leaves the box', await pg.evaluate(() => [...document.getElementById('doc').children].map(c => c.tagName + (c.className ? '.' + c.className.replace(/ /g, '.') : '') + ':' + c.textContent)), ['H1:T', 'DIV.box.box-note:NoteAlpha', 'P:Out', 'P:Zed']);
// remove box
await textCaret('#a'); await boxAs('none');
same('Remove box takes the box and its untouched label away and keeps the content', await pg.evaluate(() => [...document.getElementById('doc').children].map(c => c.tagName + ':' + c.textContent)), ['H1:T', 'P:Alpha', 'P:Out', 'P:Zed']);
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(120);
check('undo brings the box back', await pg.evaluate(() => !!document.querySelector('#doc .box.box-note #a')));
await pg.evaluate(() => { document.querySelector('#doc .box-h').textContent = 'Read this'; }); await textCaret('#a'); await boxAs('none');
same('a retyped label stays as a paragraph when the box is removed', await pg.evaluate(() => [...document.getElementById('doc').children].slice(0, 3).map(c => c.tagName + (c.className ? '.' + c.className : '') + ':' + c.textContent)), ['H1:T', 'P:Read this', 'P:Alpha']);
// by the title, by a table, and inside a box
await load(pg, DOC + ''); await pg.evaluate(() => { const h = document.querySelector('#doc h1'); h.insertAdjacentHTML('afterend', '<p class="sub">Sub</p>'); }); await textCaret('#doc h1'); await boxAs('note');
same('from the title, the box goes after the subtitle', await pg.evaluate(() => [...document.getElementById('doc').children].slice(0, 3).map(c => c.tagName + (c.className ? '.' + c.className.replace(/ /g, '.') : ''))), ['H1', 'P.sub', 'DIV.box.box-note']);
await caretIn(pg, '#cell'); await boxAs('info');
check('from a table cell, the box goes after the table, not in the cell', await pg.evaluate(() => { const tw = document.querySelector('#doc > .tw'); return tw.nextElementSibling.matches('.box.box-info') && !document.querySelector('#doc td .box') && !document.querySelector('#doc .box table'); }), await html());
await boxAs('warning');
check('with the cursor in a box, the list changes that box and never makes a box in a box', await pg.evaluate(() => document.querySelectorAll('#doc .box').length === 2 && !document.querySelector('#doc .box .box') && document.querySelector('#doc > .tw').nextElementSibling.matches('.box.box-warning')), await html());
// saved and re-opened; the saved file shows the box with no script
await load(pg, '<main><h1>T</h1><div class="box box-critical" role="note"><p class="box-h">Critical</p><p>Never mix scoops.</p><ul><li>one</li></ul></div><p>after</p></main>');
const saved = await pg.evaluate(() => FLE.build());
check('the saved document carries the box and has no script', saved.includes('<div class="box box-critical" role="note"><p class="box-h">Critical</p><p>Never mix scoops.</p><ul><li>one</li></ul></div>') && !/<script/i.test(saved));
await load(pg, saved);
same('a saved box opens unchanged', await outer('#doc .box'), '<div class="box box-critical" role="note"><p class="box-h">Critical</p><p>Never mix scoops.</p><ul><li>one</li></ul></div>');
// copy and paste a whole box
const copy = () => pg.evaluate(() => { const dt = new DataTransfer(); document.getElementById('doc').dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return dt.getData('text/html'); });
const paste = (h) => pg.evaluate((h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', ''); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h);
await pg.evaluate(() => { const d = document.getElementById('doc'), r = document.createRange(); r.setStartBefore(d.querySelector('.box')); r.setEndAfter(d.querySelector('.box')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); });
const clip = await copy(); await pg.evaluate(() => { const p = document.querySelector('#doc > p:last-child'), r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await paste(clip); await sleep(80);
check('a copied box pastes as a box', await pg.evaluate(() => document.querySelectorAll('#doc > .box.box-critical').length === 2 && document.querySelectorAll('#doc .box-h').length === 2), await html());
// repeat
await load(pg, DOC); await textCaret('#a'); await boxAs('tip'); await textCaret('#z'); await click(pg, 'repeat'); await sleep(80);
check('Repeat inserts the same kind of box again', await pg.evaluate(() => document.querySelectorAll('#doc .box.box-tip').length === 2 && document.querySelector('#z').nextElementSibling.matches('.box.box-tip')), await html());
// picture for the record
await load(pg, '<main><h1>Boxes</h1><div class="box box-note" role="note"><p class="box-h">Note</p><p>Stock is counted at close, not at open.</p></div><div class="box box-info" role="note"><p class="box-h">Information</p><p>The refill log is kept for twelve months.</p></div><div class="box box-tip" role="note"><p class="box-h">Tip</p><p>Refill the slow sellers first.</p></div><div class="box box-warning" role="note"><p class="box-h">Allergen warning</p><p>Do not top up a bin. Empty it, clean it, then refill.</p></div><div class="box box-critical" role="note"><p class="box-h">Critical</p><p>Never use a nut scoop in a nut-free bin.</p><ul><li>Use the red scoop set only.</li><li>Tell the shift lead if a scoop is missing.</li></ul></div></main>');
const cols = await pg.evaluate(() => [...document.querySelectorAll('#doc .box')].map(x => [getComputedStyle(x).borderLeftColor, getComputedStyle(x).backgroundColor]));
const nums = v => v.match(/\d*\.?\d+/g).slice(0, 3).map(Number);
check('each type has its own colour, and the Information tint is blue', new Set(cols.map(c => c[0])).size === 5 && new Set(cols.map(c => c[1])).size === 5 && (([r, g, bl]) => bl > r && bl > g)(nums(cols[1][1].replace('srgb', ''))), cols);
await pg.screenshot({ path: path.join(ROOT, 'test', 'out', 'boxes.png'), clip: { x: 0, y: 0, width: 1440, height: 640 } });
same('no page errors', errors, []);
await b.close();
