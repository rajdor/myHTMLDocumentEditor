// List indent and outdent: buttons, and Tab and Shift+Tab outside a table. Indent moves items under the item above;
// outdent moves them out a level, and at the top level turns them into paragraphs. Q&A lists are untouched.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const out = (sel = '#doc') => pg.evaluate((sel) => { const c = document.querySelector(sel).cloneNode(true); c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); return c.innerHTML.replace(/\s*\n\s*/g, ''); }, sel);
const body = async () => (await out()).replace(/^<h1[^>]*>T<\/h1>/, '');
const at = () => pg.evaluate(() => { const g = getSelection(); return g.anchorNode.textContent + '@' + g.anchorOffset; });
const DOC = '<main><h1>T</h1><ul><li id="a">a</li><li id="b">b</li><li id="c">c</li><li id="d">d</li></ul><p id="p">para</p></main>';
await load(pg, DOC);
const dim = (a) => pg.$eval('#chrome [data-a="' + a + '"]', x => x.classList.contains('dim'));
await caretIn(pg, '#p'); await sleep(60); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(60);
check('the buttons are dimmed outside a list', await dim('indent') && await dim('outdent'));
await caretIn(pg, '#a'); await click(pg, 'indent'); await sleep(80);
same('the first item has nothing above it, so it stays', await body(), '<ul><li>a</li><li>b</li><li>c</li><li>d</li></ul><p>para</p>');
await pg.evaluate(() => { const g = getSelection(); g.collapse(document.querySelector('#b').firstChild, 1); document.dispatchEvent(new Event('selectionchange')); }); await sleep(60);
check('the buttons are live in a list', !(await dim('indent')) && !(await dim('outdent')));
await click(pg, 'indent'); await sleep(80);
same('Indent moves the item under the one above', await body(), '<ul><li>a<ul><li>b</li></ul></li><li>c</li><li>d</li></ul><p>para</p>');
same('the cursor stays where it was in the text', await at(), 'b@1');
await caretIn(pg, '#c'); await K.press('Tab'); await sleep(80);
same('Tab does the same, joining the inner list already there', await body(), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul><p>para</p>');
await K.press('Tab'); await sleep(80);
same('and again goes a level deeper', await body(), '<ul><li>a<ul><li>b<ul><li>c</li></ul></li></ul></li><li>d</li></ul><p>para</p>');
await K.type('!'); same('typing carries on in the item', await pg.$eval('#c', e => e.textContent), 'c!');
await K.press('Backspace');
await K.down('Shift'); await K.press('Tab'); await K.up('Shift'); await sleep(80);
same('Shift+Tab moves it back out', await body(), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul><p>para</p>');
// outdent from the middle: the items below go with it
await caretIn(pg, '#b'); await click(pg, 'outdent'); await sleep(80);
same('Outdent takes the item out a level; the items below it at the old level become its inner list', await body(), '<ul><li>a</li><li>b<ul><li>c</li></ul></li><li>d</li></ul><p>para</p>');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo puts it back', await body(), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul><p>para</p>');
// several items at once
await load(pg, DOC);
await pg.evaluate(() => { const r = document.createRange(); r.setStart(document.querySelector('#b').firstChild, 0); r.setEnd(document.querySelector('#c').firstChild, 1); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'indent'); await sleep(80);
same('a selection indents all its items', await body(), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul><p>para</p>');
check('and stays selected', await pg.evaluate(() => getSelection().toString().replace(/\s+/g, '') === 'bc'));
await click(pg, 'repeat'); await sleep(80);
same('the repeat key repeats it: the first of them has nothing above it now, so nothing moves', await body(), '<ul><li>a<ul><li>b</li><li>c</li></ul></li><li>d</li></ul><p>para</p>');
// top level: becomes a paragraph
await load(pg, DOC); await caretIn(pg, '#b'); await click(pg, 'outdent'); await sleep(80);
same('Outdent at the top level turns the item into a paragraph, splitting the list', await body(), '<ul><li>a</li></ul><p>b</p><ul><li>c</li><li>d</li></ul><p>para</p>');
same('with the cursor still in its text', await at(), 'b@1');
await caretIn(pg, '#a'); await K.down('Shift'); await K.press('Tab'); await K.up('Shift'); await sleep(80);
same('Shift+Tab does the same, and an emptied list goes', await body(), '<p>a</p><p>b</p><ul><li>c</li><li>d</li></ul><p>para</p>');
// kinds of list
await load(pg, '<main><h1>T</h1><ol class="dense"><li id="a">a</li><li id="b">b</li></ol><ul class="check"><li><input type="checkbox" checked>x</li><li id="y"><input type="checkbox">y</li></ul><dl class="qa"><dt id="q">Q</dt><dd>A</dd></dl></main>');
await caretIn(pg, '#b'); await click(pg, 'indent'); await sleep(80);
check('an inner list is the same kind as its list', (await body()).startsWith('<ol class="dense"><li>a<ol><li>b</li></ol></li></ol>'), await body());
await caretIn(pg, '#y'); await click(pg, 'indent'); await sleep(80);
check('an indented checklist item keeps its box', await pg.evaluate(() => { const y = document.querySelector('#y'); return y.parentNode.matches('ul.check') && y.parentNode.parentNode.tagName === 'LI' && y.firstChild.matches('input[type=checkbox]') && document.querySelectorAll('#doc input').length === 2; }), await body());
await click(pg, 'outdent'); await sleep(60); await click(pg, 'outdent'); await sleep(80);
check('a checklist item that leaves the list loses its box', await pg.evaluate(() => { const y = document.querySelector('#doc ul.check + p'); return !!y && y.textContent === 'y' && document.querySelectorAll('#doc input').length === 1; }), await body());
const qa = await out('#doc dl'); await caretIn(pg, '#q'); await K.press('Tab'); await sleep(80);
same('Q&A lists are untouched', await out('#doc dl'), qa);
// in a table: Tab in a cell moves between cells, Tab in a list in a cell indents; outdent makes plain lines
await load(pg, '<main><h1>T</h1><div class="tw"><table><tbody><tr><td id="c0">first</td><td id="c1">Intro<ul><li id="a">a</li><li id="b">b</li></ul></td><td id="c2">next</td></tr></tbody></table></div></main>');
await caretIn(pg, '#c0'); await K.press('Tab'); await sleep(80);
same('in a table cell Tab still moves to the next cell', [await pg.evaluate(() => { let n = getSelection().anchorNode; if (n.nodeType !== 1) n = n.parentElement; return n.closest('td').id; }), await out('#c1')], ['c1', 'Intro<ul><li>a</li><li>b</li></ul>']);
await caretIn(pg, '#b'); await K.press('Tab'); await sleep(80);
same('in a list inside a cell Tab indents the item', await out('#c1'), 'Intro<ul><li>a<ul><li>b</li></ul></li></ul>');
await click(pg, 'outdent'); await sleep(60); await click(pg, 'outdent'); await sleep(80);
check('in a cell an item that leaves the list becomes a plain line, not a paragraph', await pg.evaluate(() => { const c = document.querySelector('#c1'); return !c.querySelector('p') && c.querySelectorAll('li').length === 1 && /^Intro\s*a\s*b$/.test(c.innerText.trim().replace(/\n+/g, ' ')); }), await out('#c1'));
check('the saved list markup is valid: lists sit only inside items', await pg.evaluate(() => !document.querySelector('#doc ul > ul, #doc ol > ol, #doc ul > ol, #doc ol > ul, #doc p > ul, #doc p > ol')));
same('no page errors', errors, []);
await b.close();
