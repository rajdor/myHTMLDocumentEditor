// Copy format (format painter): picks up the block style and bold, italics and ID tag at the cursor; a click gives a
// block the style, a selection gets the inline formatting too; once by default, kept on by a double-click.
import { open, check, same, caretIn, click, sleep, load } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = 'Control';
const DOC = '<main><h1>T</h1><h2>Head</h2><p class="bluf" id="lead">Lead with <b><i>strong slant</i></b> and <span class="id">ID-9</span> tag</p><p id="a">Alpha beta gamma</p><p id="b">Bravo <b>bold</b> text</p><p id="c">Charlie</p><ul><li id="li">item text</li></ul><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="td">cell text</td></tr></tbody></table></div><pre id="code">x = 1</pre><p id="l"><a href="https://example.com/">link</a> here</p></main>';
const html = (s) => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.outerHTML.replace(/ id="[^"]*"/, '') : null; }, s);
const on = () => pg.evaluate(() => [document.querySelector('[data-a="paint"]').classList.contains('on'), document.getElementById('doc').classList.contains('ed-paint')]);
// put the caret in a node (selector, child index, offset) as a mouse click would, then fire mouseup
const clickAt = async (s, i = 0, o = 0) => { await pg.evaluate((s, i, o) => { const e = document.querySelector(s); const r = document.createRange(); r.setStart(e.childNodes[i] || e, o); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); e.dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }, s, i, o); await sleep(60); };
const selectAt = async (a, z) => { await pg.evaluate((a, z) => { const at = ([s, i, o]) => { const e = document.querySelector(s); return [e.childNodes[i] || e, o]; }; const r = document.createRange(); r.setStart(...at(a)); r.setEnd(...at(z)); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector(z[0]).dispatchEvent(new MouseEvent('mouseup', { bubbles: true })); }, a, z); await sleep(60); };
const src = async (s, i = 0, o = 1) => { await pg.evaluate((s, i, o) => { const e = document.querySelector(s); const r = document.createRange(); r.setStart(e.childNodes[i] || e, o); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }, s, i, o); await sleep(30); };

await load(pg, DOC);
same('the button starts off', await on(), [false, false]);
// block style by a click
await src('#doc h2'); await click(pg, 'paint'); await sleep(30);
same('pressing it with the cursor in the source switches it on', await on(), [true, true]);
await clickAt('#a');
same('a click gives the block the source block style', await html('#doc h2:nth-of-type(2)'), '<h2>Alpha beta gamma</h2>');
same('and it switches off after one use', await on(), [false, false]);
await clickAt('#c'); same('a later click does nothing', await html('#c'), '<p>Charlie</p>');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(100);
same('one undo takes it back', await html('#a'), '<p>Alpha beta gamma</p>');
// a paragraph style with a class
await src('#lead'); await click(pg, 'paint'); await clickAt('#c');
same('a paragraph style (Lead paragraph) is copied', await html('#c'), '<p class="bluf">Charlie</p>');
same('a click does not add inline formatting', await pg.evaluate(() => document.querySelector('#c').querySelector('b,i,span')), null);
// inline formatting onto a selection
await load(pg, DOC); await src('#lead i'); await click(pg, 'paint'); await selectAt(['#a', 0, 6], ['#a', 0, 10]);
check('selected text gets the block style and bold and italics', /^<p class="bluf">Alpha <(b|i)><(b|i)>beta<\/(b|i)><\/(b|i)> gamma<\/p>$/.test(await html('#a')), await html('#a'));
check('no inline styles are written', !/style=/.test(await pg.evaluate(() => document.getElementById('doc').innerHTML)));
// plain source removes bold from the selection
await load(pg, DOC); await src('#a'); await click(pg, 'paint'); await selectAt(['#b', 0, 0], ['#b', 2, 5]);
same('a plain source takes bold off the selection', await html('#b'), '<p>Bravo bold text</p>');
// ID tag
await load(pg, DOC); await src('#lead .id'); await click(pg, 'paint'); await selectAt(['#a', 0, 0], ['#a', 0, 5]);
same('the ID tag is copied onto selected text', await html('#a'), '<p class="bluf"><span class="id">Alpha</span> beta gamma</p>');
// list items and cells: inline only
await load(pg, DOC); await src('#doc h2'); await click(pg, 'paint'); await clickAt('#li');
same('a list item keeps its structure', await html('#li'), '<li>item text</li>');
await src('#b b'); await click(pg, 'paint'); await selectAt(['#td', 0, 0], ['#td', 0, 4]);
same('a table cell takes the inline formatting only', await html('#td'), '<td><b>cell</b> text</td>');
// code and links
await load(pg, DOC); await src('#code'); await click(pg, 'paint'); await clickAt('#a');
same('code block style is copied', await html('#doc pre:nth-of-type(1)'), '<pre>Alpha beta gamma</pre>');
await src('#b b'); await click(pg, 'paint'); await selectAt(['#code', 0, 0], ['#code', 0, 5]);
same('a paragraph format painted onto a code block makes it a paragraph', await html('#doc .tw + p'), '<p><b>x = 1</b></p>');
await load(pg, DOC); await src('#l a'); await click(pg, 'paint'); await selectAt(['#a', 0, 0], ['#a', 0, 5]);
same('links are not copied', await html('#a'), '<p>Alpha beta gamma</p>');
// several blocks at once
await load(pg, DOC); await src('#doc h2'); await click(pg, 'paint'); await selectAt(['#a', 0, 2], ['#c', 0, 3]);
same('a selection across blocks restyles each of them', await pg.evaluate(() => [...document.querySelectorAll('#doc h2')].map(h => h.textContent)), ['Head', 'Alpha beta gamma', 'Bravo bold text', 'Charlie']);
// double-click keeps it on; Escape ends
await load(pg, DOC); await src('#doc h2');
await pg.evaluate(() => { const b = document.querySelector('[data-a="paint"]'); b.click(); b.click(); b.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })); }); await sleep(50);
same('a double-click switches it on', await on(), [true, true]);
await clickAt('#a'); await clickAt('#c');
same('and it stays on for several uses', [await pg.evaluate(() => document.querySelectorAll('#doc h2').length), await on()], [3, [true, true]]);
await K.press('Escape'); await sleep(30); same('Escape switches it off', await on(), [false, false]);
await src('#doc h2'); await click(pg, 'paint'); await click(pg, 'paint'); same('pressing the button again switches it off', await on(), [false, false]);
same('no page errors', errors, []);
await b.close();
