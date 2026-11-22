// Line styles over several blocks. Code block over several blocks makes one code block with a line for each (the
// browser runs their text together); a heading or paragraph style over several blocks goes on each of them (the
// browser makes one block with line breaks), and on a code block gives a block for each line. List items the selection
// reaches leave their list first, from inside or outside the list, in one list or two, nested or not; the rest of the
// list stays a list. Blocks keep their id; a block already in the style is left as it is. One Undo puts it all back.
// An ID tag made from a selection keeps the spacing around it, and typing straight after it goes outside it.
import { open, check, same, sleep } from './harness.mjs';
const { b, pg, errors } = await open({ prompt: '2,2' });
const q = (f, ...a) => pg.evaluate(f, ...a);
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const html = () => q(() => document.querySelector('#doc').innerHTML.replace(/ data-t="[^"]*"/g, '').replace(/ id="[a-z0-9-]+"(?=>)/g, (m) => m));
const pick = (a, ao, z, zo) => q((a, ao, z, zo) => { const f = s => { const w = document.createTreeWalker(document.querySelector('[data-t="' + s + '"]'), 4); return w.nextNode(); }; const r = document.createRange(); r.setStart(f(a), ao); if (z) r.setEnd(f(z), zo); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); document.dispatchEvent(new Event('selectionchange')); }, a, ao, z, zo);
const style = v => q((v) => { const s = document.querySelector('#s-block'); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, v);
const doc = async h => { await q(h => FLE.load(h, 'p.html'), '<main><h1>T</h1>' + h + '</main>'); await sleep(120); };
const body = async () => (await q(() => [...document.querySelector('#doc').children].slice(1).map(e => e.outerHTML.replace(/ (data-t|id)="[^"]*"/g, '')).join('')));
const undo = async () => { await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(120); };
const run = async (name, h, a, ao, z, zo, v, want) => { await doc(h); const before = await body(); await pick(a, ao, z, zo); await sleep(30); await style(v); await sleep(150); same(name, await body(), want); await undo(); same('  and one Undo puts it back', await body(), before); };

await run('Code block over two paragraphs: one code block, a line for each', '<p data-t="a">one</p><p data-t="b">two</p>', 'a', 1, 'b', 2, 'pre', '<pre>one<br>two</pre>');
await run('over a heading and a list item: the item leaves its list first', '<h2 data-t="a">Heading two</h2><ul><li data-t="b">first item</li><li>second</li></ul>', 'a', 2, 'b', 3, 'pre', '<pre>Heading two<br>first item</pre><ul><li>second</li></ul>');
await run('over items in two lists', '<ul class="check"><li data-t="a"><input type="checkbox">check item</li></ul><ol><li data-t="b">numbered item</li><li>next</li></ol>', 'a', 1, 'b', 3, 'pre', '<pre>check item<br>numbered item</pre><ol><li>next</li></ol>');
await run('from a paragraph into a nested item: the rest of the list stays a list', '<p data-t="a">para</p><ul><li>one<ul><li data-t="b">deep</li><li>deep2</li></ul></li><li>two</li></ul>', 'a', 1, 'b', 2, 'h2', '<h2>para</h2><h2>one</h2><h2>deep</h2><ul><li>deep2</li><li>two</li></ul>');
await run('a heading over several blocks goes on each', '<p data-t="a">one</p><p>two</p><p data-t="b">three</p>', 'a', 1, 'b', 2, 'h3', '<h3>one</h3><h3>two</h3><h3>three</h3>');
await run('a paragraph style on a code block gives a paragraph for each line', '<pre data-t="a">line one\nline two</pre>', 'a', 2, null, 0, 'p', '<p>line one</p><p>line two</p>');
await run('Code block in a code block changes nothing', '<pre data-t="a">line one\nline two</pre>', 'a', 2, null, 0, 'pre', '<pre>line one\nline two</pre>');
await run('two paragraphs in a box: the code block stays in the box', '<div class="box box-tip" role="note"><p class="box-h">Tip</p><p data-t="a">x one</p><p data-t="b">y two</p></div>', 'a', 1, 'b', 2, 'pre', '<div class="box box-tip" role="note"><p class="box-h">Tip</p><pre>x one<br>y two</pre></div>');
await doc('<p id="keep" data-t="a">one</p><h3 data-t="m" data-md-h="5">mid</h3><p data-t="b">two</p>'); await pick('a', 1, 'b', 2); await style('h3'); await sleep(150);
same('blocks keep their id, so links to them still work; a block already in the style keeps what it carries', await q(() => [...document.querySelectorAll('#doc h3')].map(h => (h.id === 'keep' ? 'id ' : '') + (h.dataset.mdH || '') + h.textContent)), ['id one', '5mid', 'two']);
await doc('<p data-t="a">alpha</p><p data-t="b">omega</p>'); await pick('a', 1, 'b', 2); await style('pre'); await sleep(120);
same('the code block is selected afterwards', await q(() => getSelection().toString()), 'alpha\nomega');
check('a code block made of lines saves them as lines in Markdown too', await q(() => !FLE.NB.MD || FLE.NB.MD.write(document.querySelector('#doc').cloneNode(true), { style: { bullet: '-', em: '*', strong: '**' }, fm: '', gap: '' }).includes('```\nalpha\nomega\n```')));

// ID tags and the spacing around them
const tag = async (h, s, e, type) => { await doc('<p data-t="p">' + h + '</p>'); await pick('p', s, 'p', e); await sleep(30); await pg.click('#chrome [data-a="tag"]'); await sleep(150); if (type) { await pg.keyboard.type(type); await sleep(80); } return q(() => document.querySelector('#doc p').innerHTML); };
same('a tag made from a word with a space after it adds no space', await tag('alpha REQ7 omega', 6, 10, ''), 'alpha <span class="id">REQ7</span> omega');
same('one followed by punctuation keeps it close', await tag('see REQ7, then', 4, 8, ''), 'see <span class="id">REQ7</span>, then');
same('part of a word: the rest of the word is not split off', await tag('Plain words in', 2, 8, ''), 'Pl<span class="id">ain wo</span>rds in');
same('typing straight after it goes outside the tag', await tag('alpha REQ7 omega', 6, 10, 'XY'), 'alpha <span class="id">REQ7</span>XY omega');
same('at the end of a line a space follows the tag, to type after', await tag('alpha REQ7', 6, 10, 'X'), 'alpha <span class="id">REQ7</span>&nbsp;X');
same('with nothing selected the placeholder is spaced from the word after it', await tag('alpha omega', 6, 6, 'R1'), 'alpha <span class="id">R1</span>&nbsp;omega');
same('but not given a second space', await tag('alpha omega', 5, 5, 'R1'), 'alpha<span class="id">R1</span> omega');
same('no errors in the page', errors, []);
await b.close();
