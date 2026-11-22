// Line breaks, ID tags and joins in running text. A line break typed beside an ID tag goes outside it; Enter after a tag
// starts the next block plain; the ID tag button works in list items; a tag at the start of a block survives the block being
// joined to the one before, and nothing joined picks up styles. A block with line breaks becomes one list item, and one
// paragraph when the list is taken off; Enter before a line break does not start the new block with a blank line.
import { open, check, same, caretIn, sleep, load, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const html = () => pg.evaluate(() => { const m = document.getElementById('doc').cloneNode(true); m.querySelectorAll('h1').forEach(h => h.remove()); return m.innerHTML.replace(/ id="[^"]*"/g, ''); });
const at = (sel, node, off) => pg.evaluate((sel, node, off) => { const e = document.querySelector(sel), n = node === null ? e : e.childNodes[node], r = document.createRange(); r.setStart(n, off); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel, node, off);
const pick = (a, ai, ao, z, zi, zo) => pg.evaluate((a, ai, ao, z, zi, zo) => { const r = document.createRange(); r.setStart(document.querySelector(a).childNodes[ai], ao); r.setEnd(document.querySelector(z).childNodes[zi], zo); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, a, ai, ao, z, zi, zo);
const SE = async () => { await K.down('Shift'); await K.press('Enter'); await K.up('Shift'); await sleep(40); };
const word = async (n) => { await K.down('Shift'); for (let i = 0; i < n; i++) await K.press('ArrowLeft'); await K.up('Shift'); await sleep(50); };
const doc = (h) => load(pg, '<main><h1>T</h1>' + h + '</main>');
const TAG = '<span class="id">ID-1</span>', TABLE = (c) => '<div class="tw"><table><tbody><tr><td id="a">' + c + '</td></tr></tbody></table></div>';

// a line break beside an ID tag
await doc('<ul><li id="a">text ' + TAG + '</li></ul>'); await caretIn(pg, '#a'); await SE(); await K.type('x'); await sleep(60);
same('Shift+Enter at the end of a list item that ends with a tag: the break and the next line are outside the tag', await html(), '<ul><li>text ' + TAG + '<br>x</li></ul>');
await doc('<ul><li id="a">text ' + TAG + '</li></ul>'); await caretIn(pg, '#a .id'); await SE(); await K.type('x'); await sleep(60);
same('and with the cursor inside the tag, at its end', await html(), '<ul><li>text ' + TAG + '<br>x</li></ul>');
await doc('<ul><li id="a">' + TAG + ' text</li></ul>'); await at('#a', 1, 0); await SE(); await sleep(60);
check('right after a tag with text following: the break is after the tag', /^<ul><li><span class="id">ID-1<\/span><br>/.test(await html()), await html());
await doc('<ul><li id="a">' + TAG + ' text</li></ul>'); await caretIn(pg, '#a', false); await SE(); await sleep(60);
check('at the front of a tag: the break is before the tag, which stays whole', /^<ul><li><br><span class="id">ID-1<\/span> text<\/li>/.test(await html()), await html());
await doc('<p id="a">text ' + TAG + '</p>'); await caretIn(pg, '#a'); await SE(); await K.type('x'); await sleep(60);
same('the same in a paragraph', await html(), '<p>text ' + TAG + '<br>x</p>');
await doc(TABLE('text ' + TAG)); await caretIn(pg, '#a'); await K.press('Enter'); await K.type('x'); await sleep(60);
check('and in a table cell, where Enter is a line break', (await html()).includes('<td>text ' + TAG + '<br>x</td>'), await html());
await doc('<dl class="qa"><dt>Q</dt><dd id="a">answer ' + TAG + '</dd></dl>'); await caretIn(pg, '#a'); await SE(); await K.type('x'); await sleep(60);
check('and in a Q&A answer', (await html()).includes('answer ' + TAG + '<br>x</dd>'), await html());
await sleep(450); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
check('undo takes the break back', !(await html()).includes('<br>x'), await html());
await doc('<ul><li id="a">one</li><li>two</li></ul>'); await caretIn(pg, '#a'); await SE(); await K.type('x'); await sleep(60);
same('Shift+Enter in a plain item is as before', await html(), '<ul><li>one<br>x</li><li>two</li></ul>');

// Enter after a tag
await doc('<ul><li id="a">text ' + TAG + '</li></ul>'); await caretIn(pg, '#a'); await K.press('Enter'); await K.type('x'); await sleep(60);
same('Enter at the end of an item that ends with a tag: the new item is plain', await html(), '<ul><li>text ' + TAG + '</li><li>x</li></ul>');
await doc('<p id="a">text ' + TAG + '</p>'); await caretIn(pg, '#a'); await K.press('Enter'); await K.type('x'); await sleep(60);
same('and so is the new paragraph', await html(), '<p>text ' + TAG + '</p><p>x</p>');
await doc('<ul class="check"><li id="a"><input type="checkbox">text ' + TAG + '</li></ul>'); await caretIn(pg, '#a'); await K.press('Enter'); await K.type('x'); await sleep(60);
check('a new checklist item gets its box', /<li><input type="checkbox">text <span class="id">ID-1<\/span><\/li><li><input type="checkbox">x<\/li>/.test(await html()), await html());

// the ID tag button
await doc('<ul><li id="a">one REQ-1</li></ul>'); await caretIn(pg, '#a'); await word(5); await click(pg, 'tag'); await sleep(60);
same('the ID tag button makes a tag in a list item', await html(), '<ul><li>one <span class="id">REQ-1</span>&nbsp;</li></ul>');
await K.type('x'); await sleep(40);
check('and typing carries on after it, outside the tag', /<span class="id">REQ-1<\/span>(&nbsp;| )x<\/li>/.test(await html()), await html());
await doc('<ul><li id="a">one<br>REQ-1</li></ul>'); await caretIn(pg, '#a'); await word(5); await click(pg, 'tag'); await sleep(60);
same('and on a line after a line break', await html(), '<ul><li>one<br><span class="id">REQ-1</span>&nbsp;</li></ul>');
await doc('<p id="a">one REQ-1</p>'); await caretIn(pg, '#a'); await word(5); await click(pg, 'tag'); await sleep(60);
same('in a paragraph the tag carries no styles', await html(), '<p>one <span class="id">REQ-1</span>&nbsp;</p>');
await doc(TABLE('one REQ-1')); await caretIn(pg, '#a'); await word(5); await click(pg, 'tag'); await sleep(60);
check('and in a table cell', (await html()).includes('<td>one <span class="id">REQ-1</span>&nbsp;</td>'), await html());
await doc('<ul><li id="a">one</li></ul>'); await caretIn(pg, '#a'); await click(pg, 'tag'); await sleep(60);
same('with nothing selected it puts in a tag to type over', await html(), '<ul><li>one<span class="id">ID</span>&nbsp;</li></ul>');
await K.type('REQ-9'); await sleep(40);
same('the placeholder is selected, so typing replaces it and stays a tag', await html(), '<ul><li>one<span class="id">REQ-9</span>&nbsp;</li></ul>');
await sleep(450); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes the tag out', await html(), '<ul><li>one</li></ul>');
await doc('<p id="a"><br></p>'); await caretIn(pg, '#a'); await click(pg, 'tag'); await sleep(60);
same('in an empty paragraph the tag is all there is', await html(), '<p><span class="id">ID</span>&nbsp;</p>');
await doc('<ul><li id="a">alpha REQ7 omega</li></ul>');
{ const q = await pg.evaluate(() => { const t = document.querySelector('#a').firstChild, r = document.createRange(); r.setStart(t, 7); r.setEnd(t, 9); const q = r.getBoundingClientRect(); return [q.x + q.width / 2, q.y + q.height / 2]; }); await pg.mouse.click(q[0], q[1], { count: 2 }); await sleep(80); await click(pg, 'tag'); await sleep(60); }
same('a word picked with a double-click becomes the tag', await html(), '<ul><li>alpha <span class="id">REQ7</span> omega</li></ul>');

// joining blocks
await doc('<ul><li>one</li><li id="b">' + TAG + ' two</li></ul>'); await caretIn(pg, '#b', false); await K.press('Backspace'); await sleep(80);
same('Backspace at the start of an item that starts with a tag: the tag is kept', await html(), '<ul><li>one' + TAG + ' two</li></ul>');
await K.type('x'); await sleep(40);
check('and the cursor is at the join', (await html()).startsWith('<ul><li>onex'), await html());
await doc('<ul><li id="a">one ' + TAG + '</li><li>' + TAG + ' two</li></ul>'); await caretIn(pg, '#a'); await K.press('Delete'); await sleep(80);
same('Delete at the end of an item: the next item\'s tag is kept', await html(), '<ul><li>one ' + TAG + TAG + ' two</li></ul>');
await doc('<ul><li>one</li></ul><p id="b">' + TAG + ' para <b>bold</b></p>'); await caretIn(pg, '#b', false); await K.press('Backspace'); await sleep(80);
same('a paragraph joined to a list item keeps its tag', await html(), '<ul><li>one' + TAG + ' para <b>bold</b></li></ul>');
await doc('<ul><li id="a">' + TAG + ' one<br>more</li><li id="b">' + TAG + ' two<br>more2</li></ul>'); await caretIn(pg, '#b', false); await K.press('Backspace'); await sleep(80);
check('items with line breaks: the joined line keeps its tag', (await html()).startsWith('<ul><li>' + TAG + ' one<br>more' + TAG + ' two'), await html());
await doc('<ul><li id="a">one</li><li id="b">two ' + TAG + ' end</li></ul>'); await pick('#a', 0, 2, '#b', 0, 4); await K.press('Delete'); await sleep(80);
same('a selection deleted across two items: the tag after it is kept', await html(), '<ul><li>on' + TAG + ' end</li></ul>');
await doc('<ul><li id="a">one ' + TAG + ' x</li><li id="b">two <span class="id">ID-2</span> end</li></ul>'); await pick('#a', 0, 2, '#b', 0, 2); await K.press('Delete'); await sleep(80);
same('a tag inside the deleted selection goes, and the one after it stays', await html(), '<ul><li>ono <span class="id">ID-2</span> end</li></ul>');
await doc('<p>one</p><p id="b">' + TAG + ' two <code>code</code></p>'); await caretIn(pg, '#b', false); await K.press('Backspace'); await sleep(80);
same('joined paragraphs: tags and inline code pick up no styles', await html(), '<p>one' + TAG + ' two <code>code</code></p>');
await sleep(450); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes the join back', await html(), '<p>one</p><p>' + TAG + ' two <code>code</code></p>');
// deleting inside a tag is not a join: nothing is put back
await doc('<p id="a"><span class="id">A</span>Apple</p>'); await caretIn(pg, '#a .id'); await K.press('Backspace'); await sleep(80);
check('deleting a tag\'s last letter does not make a tag of the text after it', !(await html()).includes('class="id">A<'), await html());
await doc('<p id="a">x</p><p id="b">A' + '<span class="id">A</span></p>'); await at('#b', 0, 1); await K.press('Backspace'); await sleep(80);
same('plain deleting beside a tag leaves it alone', await html(), '<p>x</p><p>' + '<span class="id">A</span></p>');

// a block with line breaks and the list buttons
await doc('<p id="p">one<br>two</p><p>after</p>'); await at('#p', 2, 1); await click(pg, 'ul'); await sleep(100);
same('a paragraph with line breaks becomes one list item, breaks kept', await html(), '<ul><li>one<br>two</li></ul><p>after</p>');
await K.type('x'); await sleep(40);
same('and the cursor stays where it was', await html(), '<ul><li>one<br>txwo</li></ul><p>after</p>');
await doc('<p id="p">one<br>two</p>'); await caretIn(pg, '#p', false); await click(pg, 'ol'); await sleep(100);
same('the same from the first line, for a numbered list', await html(), '<ol><li>one<br>two</li></ol>');
await doc('<p id="p">a1<br>a2</p><p id="q">b1<br>b2</p>'); await pick('#p', 0, 0, '#q', 2, 2); await click(pg, 'ul'); await sleep(100);
same('selected paragraphs with line breaks become one item each', await html(), '<ul><li>a1<br>a2</li><li>b1<br>b2</li></ul>');
await doc('<p id="p">one<br>two</p>'); await caretIn(pg, '#p'); await click(pg, 'check'); await sleep(100);
same('and a checklist item', await html(), '<ul class="check"><li><input type="checkbox">one<br>two</li></ul>');
await doc('<p>before</p><ul><li>a</li><li id="a">one<br>two</li><li>z</li></ul>'); await caretIn(pg, '#a'); await click(pg, 'ul'); await sleep(100);
same('taking the list off an item with line breaks gives one paragraph', await html(), '<p>before</p><ul><li>a</li></ul><p>one<br>two</p><ul><li>z</li></ul>');
await K.type('x'); await sleep(40);
check('with the cursor still at the end of it', (await html()).includes('<p>one<br>twox</p>'), await html());
await doc('<ul><li id="a">one</li><li>z</li></ul>'); await caretIn(pg, '#a'); await click(pg, 'ul'); await sleep(100);
same('taking the list off a plain item gives a paragraph, not loose text', await html(), '<p>one</p><ul><li>z</li></ul>');
await doc('<ul><li id="a">one<br>two</li><li id="z">zed</li></ul>'); await pick('#a', 0, 0, '#z', 0, 1); await click(pg, 'ul'); await sleep(100);
same('taking it off several items gives a paragraph each', await html(), '<p>one<br>two</p><p>zed</p>');
await doc('<div class="box box-note" role="note"><p class="box-h">Note</p><ul><li id="a">one<br>two</li></ul></div>'); await caretIn(pg, '#a'); await click(pg, 'ul'); await sleep(100);
check('in a box too', (await html()).includes('<p class="box-h">Note</p><p>one<br>two</p></div>'), await html());
await doc('<p id="p">one<br>two</p>'); await caretIn(pg, '#p'); await click(pg, 'ul'); await sleep(60); await caretIn(pg, '#doc li'); await click(pg, 'ul'); await sleep(100);
same('list on and off again gives the paragraph back', await html(), '<p>one<br>two</p>');
await doc('<p id="p">one<br>two</p><p id="q">three<br>four</p>'); await caretIn(pg, '#p'); await click(pg, 'ol'); await sleep(60); await caretIn(pg, '#q'); await click(pg, 'repeat'); await sleep(100);
same('Repeat does the same', await html(), '<ol><li>one<br>two</li><li>three<br>four</li></ol>');

// Enter before a line break
await doc('<ul><li id="a">one<br>two</li></ul>'); await at('#a', 0, 3); await K.press('Enter'); await sleep(80);
same('Enter at the end of the first line of an item: the new item starts with the text', await html(), '<ul><li>one</li><li>two</li></ul>');
await K.type('x'); await sleep(40);
same('with the cursor at its start', await html(), '<ul><li>one</li><li>xtwo</li></ul>');
await doc('<p id="a">one<br>two</p>'); await at('#a', 0, 3); await K.press('Enter'); await sleep(80);
same('the same in a paragraph', await html(), '<p>one</p><p>two</p>');
await doc('<ul><li id="a">one<br>two</li></ul>'); await at('#a', 2, 1); await K.press('Enter'); await sleep(80);
same('Enter in the middle of a line is as before', await html(), '<ul><li>one<br>t</li><li>wo</li></ul>');
await doc('<ul><li id="a">one</li></ul>'); await caretIn(pg, '#a'); await K.press('Enter'); await sleep(80);
same('and so is Enter at the end of an item', await html(), '<ul><li>one</li><li><br></li></ul>');
same('no page errors', errors, []);
await b.close();
