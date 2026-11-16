// Clear format works on the selected text only (the whole block with the cursor only, or when the block is wholly
// selected); links and ID tags are never removed. Links use the browser's own style.
import { open, check, same, caretIn, click, sleep, load } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard;
const inner = (s) => pg.evaluate(s => document.querySelector(s).innerHTML, s);
const outer = (s) => pg.evaluate(s => document.querySelector(s).outerHTML.replace(/ id="[^"]*"/, ''), s);
// select text by its characters within an element: from the nth character to the mth of the element's text
const pickText = (s, from, to) => pg.evaluate((s, from, to) => {
  const e = document.querySelector(s), w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT); let n, pos = 0; const r = document.createRange(); let a = false;
  while ((n = w.nextNode())) { const len = n.data.length; if (!a && from <= pos + len) { r.setStart(n, from - pos); a = true; } if (to <= pos + len) { r.setEnd(n, to - pos); break; } pos += len; }
  const g = getSelection(); g.removeAllRanges(); g.addRange(r);
}, s, from, to);
const clear = async () => { await click(pg, 'clear'); await sleep(60); };

await load(pg, '<main><h1>T</h1><p id="a">aa <b>bold text</b> zz</p></main>');
await pickText('#a', 5, 10); await clear();
same('only the selected part of a bold run is cleared', await inner('#a'), 'aa <b>bo</b>ld te<b>xt</b> zz');
same('the cleared text stays selected', await pg.evaluate(() => getSelection().toString()), 'ld te');
await K.down('Control'); await K.press('z'); await K.up('Control'); await sleep(100);
same('undo restores it', await inner('#a'), 'aa <b>bold text</b> zz');
await pickText('#a', 3, 12); await clear();
same('a whole bold run selected is cleared, the rest untouched', await inner('#a'), 'aa bold text zz');

await load(pg, '<main><h1>T</h1><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="c"><i>keep</i> and <b>clear me</b> and <b>keep too</b></td></tr></tbody></table></div></main>');
await pickText('#c', 9, 17); await clear();
same('in a table cell only the selected text is cleared', await inner('#c'), '<i>keep</i> and clear me and <b>keep too</b>');
await caretIn(pg, '#c'); await clear();
same('with the cursor only, the whole cell is cleared', await inner('#c'), 'keep and clear me and keep too');

await load(pg, '<main><h1>T</h1><p id="l"><b><a href="#x">linked words</a></b></p><p id="t"><b><i><span class="id">ID-1</span> tagged</i></b> and <a href="#y"><b>bold link</b></a></p></main>');
await pickText('#l', 0, 6); await clear();
same('a link is kept when the selected part of it is cleared', await inner('#l'), '<a href="#x">linked</a><b><a href="#x"> words</a></b>');
await caretIn(pg, '#t'); await clear();
same('clearing a whole block keeps its links and ID tags', await inner('#doc > p:last-child'), '<span class="id">ID-1</span> tagged and <a href="#y">bold link</a>');

await load(pg, '<main><h1>T</h1><h2>My <i>big</i> title</h2><p class="bluf" id="p">Lead <b>one</b></p></main>');
await pickText('#doc h2', 3, 6); await clear();
same('part of a heading selected: the text is cleared, the heading stays', await outer('#doc h2'), '<h2>My big title</h2>');
await pickText('#doc h2', 0, 12); await clear();
same('a heading wholly selected becomes a paragraph', await pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(n => n.tagName + ':' + n.textContent)), ['H1:T', 'P:My big title', 'P:Lead one']);
await pickText('#p', 5, 8); await clear();
same('part of a styled paragraph: the style stays', await outer('#p'), '<p class="bluf">Lead one</p>');
await caretIn(pg, '#p'); await clear();
same('cursor only: the paragraph style is cleared', await pg.evaluate(() => document.querySelector('#doc > p:last-child').outerHTML), '<p>Lead one</p>');

// across blocks: partly selected first and last blocks, wholly selected middle
await load(pg, '<main><h1>T</h1><p id="x"><b>first block</b></p><h3><i>middle</i></h3><p id="z"><b>last block</b></p></main>');
await pg.evaluate(() => { const r = document.createRange(); r.setStart(document.querySelector('#x b').firstChild, 6); r.setEnd(document.querySelector('#z b').firstChild, 4); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await clear();
same('across blocks: selected parts cleared, the wholly selected block reset', await pg.evaluate(() => [...document.querySelectorAll('#doc > *')].slice(1).map(n => n.tagName + ':' + n.innerHTML)), ['P:<b>first </b>block', 'P:middle', 'P:last<b> block</b>']);

// links: the browser's own style
await load(pg, '<main><h1>T</h1><p>See <a href="https://example.com/a">a web link</a> and <a href="#t">an inside link</a>.</p></main>');
const st = await pg.evaluate(() => [...document.querySelectorAll('#doc p a')].map(a => { const c = getComputedStyle(a), p = getComputedStyle(a.parentNode); return [c.color, c.textDecorationLine, c.textDecorationColor === c.color, c.fontFamily === p.fontFamily, c.fontSize === p.fontSize, getComputedStyle(a, '::after').content]; }));
same('links are standard blue, underlined, in the surrounding font, with no icon', st, [['rgb(0, 0, 238)', 'underline', true, true, true, 'none'], ['rgb(0, 0, 238)', 'underline', true, true, true, 'none']]);
check('the saved document carries no link styling', !/main a \{|main a:hover|text-decoration-color/.test(await pg.evaluate(() => FLE.build())));
same('no page errors', errors, []);
await b.close();
