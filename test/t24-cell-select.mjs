// Selecting cells: Shift+click on another cell of the same table, or a drag from one cell into another, selects the
// block of cells between them (a column, a row or a rectangle). Bold, Italic, Clear format, the header and merge
// buttons, Delete, copy and cut act on that block. Escape, a click or typing ends it. Nothing of it is saved.
import { open, check, same, sleep, load, click, ROOT } from './harness.mjs';
import path from 'path';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><p id="p">Para</p><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>a1</td><td>b1 <i>it</i></td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table></div><p id="z">Zed</p></main>';
const at = (r, c, fx = 0.5) => pg.evaluate((r, c, fx) => { const x = document.querySelector('#doc table').rows[r].cells[c].getBoundingClientRect(); return [x.left + x.width * fx, x.top + x.height / 2]; }, r, c, fx);
const clickCell = async (r, c, shift) => { const p = await at(r, c); if (shift) await K.down('Shift'); await pg.mouse.click(p[0], p[1]); if (shift) await K.up('Shift'); await sleep(60); };
const sel = () => pg.evaluate(() => [...document.querySelectorAll('#doc .ed-cell')].map(c => c.textContent.trim()).join(','));
const cellHtml = (r, c) => pg.evaluate((r, c) => document.querySelector('#doc table').rows[r].cells[c].innerHTML, r, c);
const copy = (type = 'copy') => pg.evaluate(type => { const dt = new DataTransfer(); const ev = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }); document.getElementById('doc').dispatchEvent(ev); return { html: dt.getData('text/html'), text: dt.getData('text/plain'), handled: ev.defaultPrevented }; }, type);

await load(pg, DOC);
// Shift+click selects a column of cells
await clickCell(1, 1); await clickCell(3, 1, true);
same('Shift+click on another cell selects the block between them: here a column', await sel(), 'b1 it,b2,b3');
check('the text selection is not stretched across the rows', await pg.evaluate(() => getSelection().isCollapsed));
await pg.screenshot({ path: path.join(ROOT, 'test', 'out', 'cell-select.png'), clip: { x: 280, y: 60, width: 1160, height: 300 } });
await clickCell(2, 2, true);
same('another Shift+click moves the far corner; the block still starts at the first cell', await sel(), 'b1 it,c1,b2,c2');
await clickCell(3, 1, true);
// Bold on the block
await click(pg, 'bold'); await sleep(80);
same('Bold makes every cell in the block bold and leaves the rest', [await cellHtml(1, 1), await cellHtml(2, 1), await cellHtml(3, 1), await cellHtml(2, 0), await cellHtml(2, 2)], ['<b>b1 <i>it</i></b>', '<b>b2</b>', '<b>b3</b>', 'a2', 'c2']);
same('the block stays selected, so more can be done to it', await sel(), 'b1 it,b2,b3');
await click(pg, 'italic'); await sleep(80);
check('Italic then applies to the same cells', (await cellHtml(2, 1)).includes('<i>') && (await cellHtml(3, 1)).includes('<i>') && !(await cellHtml(2, 0)).includes('<i>'), [await cellHtml(2, 1), await cellHtml(3, 1)]);
await click(pg, 'clear'); await sleep(80);
same('Clear format clears the cells in the block', [await cellHtml(1, 1), await cellHtml(2, 1), await cellHtml(3, 1)], ['b1 it', 'b2', 'b3']);
await K.down(mod); await K.press('b'); await K.up(mod); await sleep(80);
same('the Bold shortcut works on the block too', [await cellHtml(2, 1), await cellHtml(2, 0)], ['<b>b2</b>', 'a2']);
await K.down(mod); await K.press('b'); await K.up(mod); await sleep(80);
same('and again takes it off', await cellHtml(2, 1), 'b2');
// header buttons use the block
await click(pg, 'sc'); await sleep(80);
same('a header button acts on the block: Sub header column on the selected column', await pg.evaluate(() => [...document.querySelector('#doc table').rows].map(r => [...r.cells].map(c => c.tagName === 'TH' ? (c.classList.contains('sub') ? 'S' : 'H') : '.').join('')).join(' ')), 'HHH .S. .S. .S.');
same('and the block is still selected afterwards', await sel(), 'b1 it,b2,b3');
await click(pg, 'sc'); await sleep(80);
// copy: a table of just those cells, and tab-separated text
const c1 = await copy();
check('copy puts just the selected cells on the clipboard as a table', c1.handled && /<table><tbody><tr><td>b1 it<\/td><\/tr><tr><td>b2<\/td><\/tr><tr><td>b3<\/td><\/tr><\/tbody><\/table>/.test(c1.html) && !/ed-cell/.test(c1.html), c1.html);
same('and as plain text, one line per row', c1.text, 'b1 it\nb2\nb3');
// a rectangle by dragging
let p = await at(1, 0), q = await at(2, 2);
await pg.mouse.move(p[0], p[1]); await pg.mouse.down(); await pg.mouse.move((p[0] + q[0]) / 2, (p[1] + q[1]) / 2, { steps: 4 }); await pg.mouse.move(q[0], q[1], { steps: 4 }); await pg.mouse.up(); await sleep(80);
same('dragging from one cell into another selects the rectangle of cells', await sel(), 'a1,b1 it,c1,a2,b2,c2');
const c2 = await copy();
same('copied as text, cells in a row are separated by tabs', c2.text, 'a1\tb1 it\tc1\na2\tb2\tc2');
// cut and Delete empty the cells; undo brings them back
await copy('cut'); await sleep(80);
same('cut empties the selected cells and leaves the others', await pg.evaluate(() => [...document.querySelector('#doc table').rows].map(r => [...r.cells].map(c => c.textContent).join('|')).join(' / ')), 'A|B|C / || / || / a3|b3|c3');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo brings the cells back', await pg.evaluate(() => document.querySelector('#doc table').rows[2].textContent), 'a2b2c2');
check('and no selection marks are left behind', await pg.evaluate(() => !document.querySelector('#doc .ed-cell') && !document.querySelector('#doc [class=""]')));
await clickCell(3, 0); await clickCell(3, 2, true); await K.press('Delete'); await sleep(80);
same('Delete empties a selected row of cells', await pg.evaluate(() => document.querySelector('#doc table').rows[3].textContent), '');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
// merge uses the block
await clickCell(1, 0); await clickCell(2, 0, true); await click(pg, 'md'); await sleep(80);
same('a merge button merges the selected block', await pg.evaluate(() => { const c = document.querySelector('#doc table').rows[1].cells[0]; return [c.rowSpan, c.textContent]; }), [2, 'a1a2']);
check('and the block selection ends when the table changes shape', (await sel()) === '');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
// ending the selection
await clickCell(1, 1); await clickCell(3, 1, true); await K.press('Escape'); await sleep(60);
same('Escape ends the selection', await sel(), '');
await clickCell(1, 1); await clickCell(3, 1, true); await clickCell(2, 2);
same('a plain click ends it', await sel(), '');
await clickCell(1, 2); await clickCell(3, 2, true); await K.type('x'); await sleep(80);
check('typing ends it and types in the first cell only', (await sel()) === '' && (await cellHtml(1, 2)).includes('x') && (await cellHtml(2, 2)) === 'c2' && (await cellHtml(3, 2)) === 'c3', [await cellHtml(1, 2), await cellHtml(2, 2)]);
// inside one cell, and across to outside the table, Shift+click is still a text selection
await load(pg, DOC);
p = await at(1, 1, 0.02); await pg.mouse.click(p[0], p[1]); q = await at(1, 1, 0.12); await K.down('Shift'); await pg.mouse.click(q[0], q[1]); await K.up('Shift'); await sleep(60);
check('Shift+click inside the same cell is still a text selection', (await sel()) === '' && await pg.evaluate(() => !getSelection().isCollapsed));
await pg.click('#p'); p = await at(1, 1); await K.down('Shift'); await pg.mouse.click(p[0], p[1]); await K.up('Shift'); await sleep(60);
check('Shift+click from outside the table is still a text selection', (await sel()) === '' && await pg.evaluate(() => !getSelection().isCollapsed));
// nothing of a selection is saved
await clickCell(1, 0); await clickCell(2, 1, true); await sleep(450);
const saved = await pg.evaluate(() => FLE.build());
check('a selection is not saved with the document', !/ed-cell/.test(saved) && (await sel()) !== '');
same('no page errors', errors, []);
await b.close();
