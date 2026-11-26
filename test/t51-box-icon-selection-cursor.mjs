// The cursor after the page is tidied, and three things about boxes.
// Markup left by another program (a span with no class, a style attribute) is taken out as you type; the cursor must stay
// where it was, also on an empty line and at the start of a line. A box holds its text in paragraphs, whatever the page it
// came in had. Hide icon and Show icon in the Box list. The Box list puts the selected blocks in a new box.
import { open, check, same, sleep, load, caretIn } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard;
const q = (f, ...a) => pg.evaluate(f, ...a);
const boxAs = async (v) => { await pg.select('#s-boxtype', v); await sleep(80); };
const kids = (s = '#doc') => q(s => [...document.querySelector(s).children].map(c => c.tagName + (c.className ? '.' + c.className.replace(/ /g, '.') : '') + ':' + c.textContent), s);
const here = () => q(() => { const g = getSelection(); let n = g.anchorNode; if (n.nodeType !== 1) n = n.parentElement; const p = n.closest('#doc p, #doc li'), r = document.createRange(); r.selectNodeContents(p); r.setEnd(g.anchorNode, g.anchorOffset); return { text: p.textContent, before: r.toString(), index: [...p.parentNode.children].indexOf(p), inBox: !!p.closest('.box') }; });
const end = (sel) => q(sel => { const e = document.querySelector(sel); let t = e; while (t.lastChild) t = t.lastChild; const r = document.createRange(); r.setStart(t, t.nodeType === 3 ? t.length : 0); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel);
const at = (sel, k) => q((sel, k) => { const e = document.querySelector(sel); let t = e; while (t.firstChild) t = t.firstChild; const r = document.createRange(); r.setStart(t, k); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel, k);
const span = (a, ao, z, zo) => q((a, ao, z, zo) => { const first = e => { while (e.firstChild) e = e.firstChild; return e; }, r = document.createRange(); r.setStart(first(document.querySelector(a)), ao); r.setEnd(first(document.querySelector(z)), zo); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, a, ao, z, zo);

// ---- the cursor, where another program's markup is tidied away as you type
const leftover = (inner) => q(inner => { document.querySelector('#a').innerHTML = inner; }, inner);   // put in after loading, as it is when the page keeps such markup
await load(pg, '<main><h1>T</h1><p id="a">x</p><p id="e">End</p></main>'); await leftover('<span>Alpha</span>'); await end('#a');
await K.press('Enter'); await sleep(80);
let h = await here();
same('Enter at the end of a line with leftover markup: the cursor is on the new, empty line', [h.text, h.index], ['', 2]);
await K.type('B'); await sleep(60);
same('and typing goes on that line', (await kids()).slice(1), ['P:Alpha', 'P:B', 'P:End']);
await K.press('Enter'); await sleep(80); await K.press('Enter'); await sleep(80); h = await here();
same('Enter twice: the cursor is on the second empty line, not back on the text', [h.text, h.index], ['', 4]);
await K.type('C'); await sleep(60);
same('and typing goes there', (await kids()).slice(1), ['P:Alpha', 'P:B', 'P:', 'P:C', 'P:End']);
check('the leftover markup is gone', await q(() => !document.querySelector('#doc span')));
await load(pg, '<main><h1>T</h1><p id="a">x</p><p id="e">End</p></main>'); await leftover('<span>AlphaBeta</span>'); await at('#a', 5);
await K.press('Enter'); await sleep(80); h = await here();
same('Enter in the middle of such a line: the cursor is at the start of the second half', [h.text, h.before], ['Beta', '']);
await load(pg, '<main><h1>T</h1><p id="a">x</p><p id="e">End</p></main>'); await leftover('<span>Alpha</span>'); await end('#a');
await K.down('Shift'); await K.press('Enter'); await K.up('Shift'); await sleep(80); await K.type('B'); await sleep(60);
same('Shift+Enter there: typing goes on the new line of the same paragraph', await q(() => document.querySelector('#a').innerHTML), 'Alpha<br>B');

// ---- a box from a page made elsewhere: its text is put in paragraphs
await load(pg, '<main><h1>T</h1><div class="box box-info"><strong>Heads up</strong><br><span id="x">Loose words</span></div><div class="box box-tip"><div class="title">Title</div><div id="y">In a div</div></div><p id="e">End</p></main>');
same('loose text in a box becomes a paragraph, and a plain div a paragraph', await q(() => [...document.querySelectorAll('#doc .box')].map(bx => [...bx.children].map(c => c.tagName + ':' + c.textContent).join('|'))), ['P:Heads upLoose words', 'P:Title|P:In a div']);
await end('#doc .box-tip p:last-child'); await K.press('Enter'); await sleep(80); await K.type('Next'); await sleep(60);
same('Enter in it starts a new line in the box and the cursor goes with it', await kids('#doc .box-tip'), ['P.title:Title', 'P:In a div', 'P:Next']);
await K.press('Enter'); await sleep(80); await K.press('Enter'); await sleep(80); await K.type('Out'); await sleep(60);
check('Enter on an empty last line leaves the box', await q(() => { const bx = document.querySelector('#doc .box-tip'); return bx.children.length === 3 && bx.nextElementSibling.textContent === 'Out'; }), await kids());
await load(pg, '<main><h1>T</h1><p id="a">Alpha</p></main>'); await end('#a'); await boxAs('note');
await q(() => { const bx = document.querySelector('#doc .box'); bx.lastChild.remove(); bx.appendChild(document.createTextNode('typed loose')); const r = document.createRange(); r.setStart(bx.lastChild, 5); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); });
await K.type('!'); await sleep(80); h = await here();
same('loose text that turns up in a box while editing is put in a paragraph, cursor kept', [await kids('#doc .box'), h.before], [['P.box-h:Note', 'P:typed! loose'], 'typed!']);

// ---- Hide icon and Show icon
const icon = () => q(() => { const bx = document.querySelector('#doc .box'), hd = bx.firstElementChild, o = document.querySelector('#s-boxtype option[value="icon"]'); return { off: bx.classList.contains('box-noicon'), drawn: getComputedStyle(hd, '::before').content !== 'none', pad: getComputedStyle(hd).paddingLeft, opt: o.textContent, dis: o.disabled, colour: getComputedStyle(hd).color, weight: getComputedStyle(hd).fontWeight, bar: getComputedStyle(bx).borderLeftColor }; });
await load(pg, '<main><h1>T</h1><p id="a">Alpha</p><p id="z">Zed</p></main>');
await end('#z'); await sleep(40);
check('outside a box, Hide icon cannot be chosen', await q(() => document.querySelector('#s-boxtype option[value="icon"]').disabled));
await end('#a'); await boxAs('warning'); await K.type('Body'); await sleep(60);
let i0 = await icon();
check('a new box has its icon, and the list offers Hide icon', !i0.off && i0.drawn && i0.opt === 'Hide icon' && !i0.dis, i0);
await boxAs('icon'); let i1 = await icon();
check('Hide icon takes the icon away and the label moves to the edge', i1.off && !i1.drawn && i1.pad === '0px' && i1.opt === 'Show icon', i1);
check('the label, its colour and the bar stay', i1.colour === i0.colour && i1.weight === i0.weight && i1.bar === i0.bar && await q(() => document.querySelector('#doc .box-h').textContent === 'Warning'), i1);
await boxAs('critical');
check('changing the type keeps the icon hidden', await q(() => { const bx = document.querySelector('#doc .box'); return bx.matches('.box-critical.box-noicon') && bx.firstElementChild.textContent === 'Critical'; }));
const saved = await q(() => FLE.build());
check('it is saved with the page, and the saved page has the style for it', /<div class="box box-noicon box-critical"|<div class="box box-critical box-noicon"/.test(saved) && saved.includes('.box.box-noicon > p.box-h::before'), (saved.match(/<div class="box[^>]*>/) || [])[0]);
await load(pg, saved); await end('#doc .box p:last-child'); await sleep(60);
check('and is still hidden when the page is opened again', (await icon()).off && !(await icon()).drawn);
await boxAs('icon'); i1 = await icon();
check('Show icon brings it back', !i1.off && i1.drawn && i1.opt === 'Hide icon', i1);
await K.down('Control'); await K.press('z'); await K.up('Control'); await sleep(150);
check('undo hides it again', await q(() => document.querySelector('#doc .box').classList.contains('box-noicon')));

// ---- the Box list on a selection
const DOC = '<main><h1>T</h1><p id="a">Alpha</p><h3>Head</h3><ul id="l"><li id="l1">one</li><li id="l2">two</li></ul><p id="z">Zed</p><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="cell">c1</td></tr></tbody></table></div><p id="e">End</p></main>';
await load(pg, DOC); await span('#a', 2, '#l1', 2); await boxAs('warning');
same('blocks the selection reaches go in the box whole, a list too', await kids(), ['H1:T', 'DIV.box.box-warning:WarningAlphaHeadonetwo', 'P:Zed', 'DIV.tw:Hc1', 'P:End']);
same('in their order, under the label', await q(() => [...document.querySelector('#doc .box').children].map(c => c.tagName)), ['P', 'P', 'H3', 'UL']);
check('the selection is kept', await q(() => getSelection().toString().replace(/\s+/g, ' ')) === 'pha Head on');
same('the Box list shows the new box', await q(() => document.querySelector('#s-boxtype').value), 'warning');
await K.down('Control'); await K.press('z'); await K.up('Control'); await sleep(150);
same('undo takes the box away again', await kids(), ['H1:T', 'P:Alpha', 'H3:Head', 'UL:onetwo', 'P:Zed', 'DIV.tw:Hc1', 'P:End']);
await load(pg, DOC); await span('#a', 1, '#a', 3); await boxAs('tip');
same('part of one paragraph selected: that paragraph goes in the box', (await kids()).slice(1, 3), ['DIV.box.box-tip:TipAlpha', 'H3:Head']);
await load(pg, DOC); await span('#a', 0, '#doc h3', 0); await boxAs('info');
same('a selection that only reaches the start of the next block leaves it out', (await kids()).slice(1, 3), ['DIV.box.box-info:InformationAlpha', 'H3:Head']);
await load(pg, DOC); await span('#l1', 1, '#l2', 1); await boxAs('note');
same('a selection inside a list takes the whole list', (await kids()).slice(3, 5), ['DIV.box.box-note:Noteonetwo', 'P:Zed']);
await load(pg, DOC); await end('#a'); await boxAs('note');
same('with no selection an empty box is inserted, as before', (await kids()).slice(1, 3), ['P:Alpha', 'DIV.box.box-note:Note']);
await load(pg, DOC); await span('#a', 2, '#z', 1); await boxAs('note'); await span('#doc h3', 1, '#l1', 1); await boxAs('tip');
check('a selection inside a box changes that box; no box is put in a box', await q(() => document.querySelectorAll('#doc .box').length === 1 && document.querySelector('#doc .box').matches('.box-tip')), await kids());

// ---- a double-click beside an ID tag selects one side only
const dbl = async (sel, dx) => { const r = await q(sel => { const e = document.querySelector(sel).getBoundingClientRect(); return { x: e.left, y: e.top + e.height / 2, w: e.width }; }, sel); const x = r.x + (dx < 0 ? r.w + dx : dx); await pg.mouse.move(x, r.y); await pg.mouse.down({ clickCount: 1 }); await pg.mouse.up({ clickCount: 1 }); await sleep(40); await pg.mouse.down({ clickCount: 2 }); await pg.mouse.up({ clickCount: 2 }); await sleep(150); return q(() => getSelection().toString()); };
await load(pg, '<main><h1>T</h1><p id="a">Before <span class="id">REQ</span><span id="w">normal</span> words</p><p id="b"><span id="v">ahead</span><span class="id">TAG</span> after</p></main>');
await q(() => document.querySelectorAll('#w, #v').forEach(x => x.replaceWith(...x.childNodes)));   // tag and word with no space character between them
same('double-click on a tag with a word hard against it selects the tag only', await dbl('#a span.id', 10), 'REQ');
const wordX = await q(() => { const t = document.querySelector('#a span.id').nextSibling, r = document.createRange(); r.setStart(t, 2); r.setEnd(t, 3); const b = r.getBoundingClientRect(), p = document.querySelector('#a').getBoundingClientRect(); return b.left - p.left; });
same('double-click on that word selects the word only', await dbl('#a', wordX), 'normal');
same('and the same with the word in front of the tag', [await dbl('#b span.id', 10), await dbl('#b', 10)], ['TAG', 'ahead']);
same('a word away from any tag is selected as ever', await dbl('#a', 10), 'Before');
same('no page errors', errors, []);
await b.close();
