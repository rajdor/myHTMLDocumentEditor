// Inspect formatting: a toolbar button opens a popup that lists, once, the formatting on the text at the cursor or at
// the start of the selection, from the outside in. It marks what the toolbar cannot make there, lists its style
// attributes as drawn, and can take one format off. Nothing is read until the button is pressed, and the popup does not follow the cursor.
import { open, check, same, caretIn, sleep, load, click, ROOT } from './harness.mjs';
import path from 'path';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><p id="p">Plain <b id="b">bold <i id="bi">both</i></b> and <code id="k">code</code> x<sup id="s">2</sup> <a id="a" href="https://example.com/x">link</a> <span class="id" id="t">ID-1</span> <span id="st" style="font-size:18px;color:red">styled</span> <u id="u">under</u></p><p class="bluf" id="lead">Lead</p><div class="box box-warning" role="note"><p class="box-h">Warning</p><p id="inbox">in a box</p></div><ul class="dense"><li>one<ul><li id="deep">deep</li></ul></li></ul><div class="tw"><table class="cw"><colgroup><col style="width:40%"><col style="width:60%"></colgroup><thead><tr><th>H</th><th>H2</th></tr></thead><tbody><tr><th class="sub" scope="row" id="sh">side</th><td id="c"><h4 id="h4">Asks</h4><strong id="str">Strong</strong></td></tr></tbody></table></div></main>';
const rows = () => pg.evaluate(() => [...document.querySelectorAll('#insp-list li')].map(li => li.querySelector('span').textContent + (li.classList.contains('odd') ? ' [!' + li.querySelector('small').textContent + ']' : '') + (li.querySelector('button') ? ' <' + li.querySelector('button').textContent + '>' : '')));
const isOpen = () => pg.evaluate(() => document.getElementById('insp').open);
const inspectAt = async (sel) => { if (await isOpen()) await click(pg, 'inspect'); await caretIn(pg, sel); await sleep(40); await click(pg, 'inspect'); await sleep(80); };
const act = (name, label) => pg.evaluate((name, label) => { const li = [...document.querySelectorAll('#insp-list li')].find(x => x.querySelector('span').textContent.startsWith(name)); const bt = li && [...li.querySelectorAll('button')].find(x => x.textContent === label); if (bt) bt.click(); return !!bt; }, name, label);

await load(pg, DOC);
check('the popup is closed until the button is pressed', !(await isOpen()));
await caretIn(pg, '#p'); await sleep(40);
check('moving the cursor does not open it or fill it', !(await isOpen()) && (await rows()).length === 0);
// plain paragraph, then nested inline formats
await inspectAt('#bi');
check('Inspect formatting opens a popup', await isOpen());
same('it lists the formatting from the outside in, with a way to remove each text format', await rows(), ['Paragraph', 'Bold <Remove>', 'Italic <Remove>']);
same('and says what it is describing', await pg.evaluate(() => document.getElementById('insp-what').textContent), 'At the cursor');
same('under Style attributes it lists the font, size, weight and colour as drawn', [await pg.evaluate(() => document.querySelector('#insp-look b').textContent), (await pg.evaluate(() => [...document.querySelectorAll('#insp-look li')].map(l => l.textContent))).map(x => x.replace(/#[0-9A-F]{6}$/, '#hex'))], ['Style attributes:', ['Font: Instrument Sans', 'Size: 15px', 'Weight: 700', 'Style: italic', 'Colour: #hex']]);
await pg.screenshot({ path: path.join(ROOT, 'test', 'out', 'inspector.png'), clip: { x: 700, y: 0, width: 740, height: 330 } });
// it does not follow the cursor: clicking in the text closes it
await pg.click('#lead'); await sleep(60);
check('clicking in the document closes the popup; it does not follow the cursor', !(await isOpen()));
await click(pg, 'inspect'); await sleep(60); await click(pg, 'inspect'); await sleep(60);
check('the button closes it again', !(await isOpen()));
await click(pg, 'inspect'); await sleep(60); await K.press('Escape'); await sleep(60);
check('Escape closes it', !(await isOpen()));
// things the toolbar cannot make are marked
await inspectAt('#k'); same('inline code is named', await rows(), ['Paragraph', 'Inline code <Remove>']);
await inspectAt('#s'); same('so is superscript', await rows(), ['Paragraph', 'Superscript <Remove>']);
await inspectAt('#u'); same('a format the toolbar does not have is marked', await rows(), ['Paragraph', 'Underline [!No toolbar button for this] <Remove>']);
await inspectAt('#a'); same('a link shows its address', await rows(), ['Paragraph', 'Link: https://example.com/x <Remove link>']);
await inspectAt('#t'); same('an ID tag is named', await rows(), ['Paragraph', 'ID tag <Remove tag>']);
await inspectAt('#st'); same('pasted styling is shown and marked', await rows(), ['Paragraph', 'Pasted styling: font-size:18px;color:red [!Not a toolbar style] <Remove>']);
check('and the style attributes report its real size and colour', /Size: 18px/.test(await pg.evaluate(() => document.getElementById('insp-look').textContent)) && /Colour: #FF0000/.test(await pg.evaluate(() => document.getElementById('insp-look').textContent)));
// blocks and containers
await inspectAt('#lead'); same('a styled paragraph is named', await rows(), ['Lead paragraph']);
await inspectAt('#inbox'); same('a box is named with its type', await rows(), ['Warning box', 'Paragraph']);
await inspectAt('#deep'); same('list items say what kind, inner and compact', await rows(), ['Bulleted list item, compact', 'Bulleted list item, in an inner list, compact']);
await inspectAt('#sh'); same('table cells say what they are', await rows(), ['Table, set column widths', 'Sub header cell (header column)']);
await inspectAt('#h4'); same('a heading inside a table cell is marked, with a way to make it a plain line', await rows(), ['Table, set column widths', 'Table cell', 'Heading 4 (H4) [!The toolbar cannot make a heading in a table cell] <Make a plain line>']);
check('its style attributes show why it differs from bold: weight 600', /Weight: 600/.test(await pg.evaluate(() => document.getElementById('insp-look').textContent)));
// taking one format off
check('the heading can be made a plain line from the popup', await act('Heading 4', 'Make a plain line')); await sleep(120);
same('it becomes a plain line in the cell', await pg.evaluate(() => document.querySelector('#c').innerHTML), 'Asks<br><strong id="str">Strong</strong>');
check('and the popup shows the result', (await isOpen()) && JSON.stringify(await rows()) === JSON.stringify(['Table, set column widths', 'Table cell']), await rows());
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
check('undo brings the heading back', await pg.evaluate(() => !!document.querySelector('#c h4')));
await inspectAt('#bi'); await act('Bold', 'Remove'); await sleep(120);
same('Remove takes off just that one format', await pg.evaluate(() => document.querySelector('#p').innerHTML.slice(0, 36)), 'Plain bold <i id="bi">both</i> and <');
await inspectAt('#st'); await act('Pasted styling', 'Remove'); await sleep(120);
check('removing pasted styling leaves the text', await pg.evaluate(() => document.querySelector('#p').textContent.includes('styled') && !document.querySelector('#p [style]')));
// a selected word
await load(pg, DOC); await pg.evaluate(() => { const p = document.querySelector('#p'), r = document.createRange(); r.setStart(p.firstChild, p.firstChild.length); r.setEnd(document.querySelector('#b').firstChild, 4); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }); await sleep(60);
await click(pg, 'inspect'); await sleep(80);
same('with a word selected it describes the selected word', [await pg.evaluate(() => document.getElementById('insp-what').textContent), await rows()], ['At the start of “bold”', ['Paragraph', 'Bold <Remove>']]);
// nothing is saved; the toolbar still fits
const saved = await pg.evaluate(() => FLE.build());
check('nothing of the inspector is saved', !/insp/.test(saved.replace(/<style>[\s\S]*?<\/style>/, '')));
check('the toolbar is still one row with Help at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return t.right - h.right < 20 && h.top - t.top < 20; }));
same('no page errors', errors, []);
await b.close();
