// Pasting a block of cells into a table: the cells go in one for one from the cursor's cell, across and down. Cells that
// hold something are replaced and rows or columns that do not fit are left out, each after asking. One cell is not a block.
import { open, check, same, sleep, load, caretCell, click } from './harness.mjs';
const { b, pg, errors, dialogs } = await open();
const K = pg.keyboard;
const DOC = '<main><h1>T</h1><p id="p">Para</p><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>a1</td><td><br></td><td>c1</td></tr><tr><td>a2 <b>bold</b></td><td><br></td><td><br></td></tr><tr><td>a3</td><td><br></td><td><br></td></tr><tr><td>a4</td><td><br></td><td>keep</td></tr></tbody></table></div><p id="z"><br></p></main>';
const at = (r, c) => pg.evaluate((r, c) => { const x = document.querySelector('#doc table').rows[r].cells[c].getBoundingClientRect(); return [x.left + x.width / 2, x.top + x.height / 2]; }, r, c);
const clickCell = async (r, c, shift) => { const p = await at(r, c); if (shift) await K.down('Shift'); await pg.mouse.click(p[0], p[1]); if (shift) await K.up('Shift'); await sleep(60); };
const grid = () => pg.evaluate(() => [...document.querySelector('#doc table').rows].map(r => [...r.cells].map(c => c.innerHTML.replace(/<br>$/, '')).join('|')));
const copy = () => pg.evaluate(() => { const dt = new DataTransfer(); document.getElementById('doc').dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true })); return { html: dt.getData('text/html'), text: dt.getData('text/plain') }; });
const paste = async (h, t = '') => { await pg.evaluate((h, t) => { const dt = new DataTransfer(); if (h) dt.setData('text/html', h); dt.setData('text/plain', t); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h, t); await sleep(80); };
const cells = (rows) => '<div data-fle-clip="1"><div class="tw"><table><tbody>' + rows.map(r => '<tr>' + r.map(c => '<td>' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></div>';
const dirty = () => pg.evaluate(() => document.querySelector('[data-a="save"]').classList.contains('has'));
const where = () => pg.evaluate(() => { const n = getSelection().anchorNode, c = (n.nodeType === 1 ? n : n.parentElement).closest('td,th'); return c ? c.parentElement.rowIndex + ':' + c.cellIndex : 'outside'; });

/* ----- a copied column into an empty column ----- */
await load(pg, DOC);
await clickCell(1, 0); await clickCell(3, 0, true);
const col = await copy();
check('a selected part of a column copies as a table of those cells', /<td>a1<\/td>/.test(col.html) && /<td>a3<\/td>/.test(col.html) && !/a4/.test(col.html), col.html);
await caretCell(pg, 0, 1, 1);
let n0 = dialogs.length;
await paste(col.html, col.text);
same('pasted with the cursor in an empty column, each cell goes into its own row', await grid(), ['A|B|C', 'a1|a1|c1', 'a2 <b>bold</b>|a2 <b>bold</b>|', 'a3|a3|', 'a4||keep']);
check('nothing was in the way, so it does not ask', dialogs.length === n0);
same('the cursor ends in the last cell filled', await where(), '3:1');
check('the page is marked as changed', await dirty());
await click(pg, 'undo'); await sleep(150);
same('Undo takes the whole paste back', await grid(), ['A|B|C', 'a1||c1', 'a2 <b>bold</b>||', 'a3||', 'a4||keep']);

/* ----- cells that already hold something ----- */
await load(pg, DOC); await caretCell(pg, 0, 2, 0); n0 = dialogs.length;
await paste(cells([['X1'], ['X2']]));
check('pasting over cells that hold something asks first and says how many', dialogs.length === n0 + 1 && /^Pasting 2 rows by 1 column of cells here:/.test(dialogs[n0]) && /replaces what is in 2 cells/.test(dialogs[n0]) && !/leaves out/.test(dialogs[n0]), dialogs[n0]);
same('OK replaces them', await grid(), ['A|B|C', 'a1||c1', 'X1||', 'X2||', 'a4||keep']);

/* ----- not enough rows ----- */
await load(pg, DOC); await caretCell(pg, 0, 3, 1); n0 = dialogs.length;
await paste(cells([['r1'], ['r2'], ['r3'], ['r4']]));
check('a paste longer than the table asks first and says what is left out', dialogs.length === n0 + 1 && /leaves out the last 2 rows: the table has only 2 rows from this cell down/.test(dialogs[n0]) && !/replaces/.test(dialogs[n0]), dialogs[n0]);
same('OK pastes what fits and adds no rows', await grid(), ['A|B|C', 'a1||c1', 'a2 <b>bold</b>||', 'a3|r1|', 'a4|r2|keep']);

/* ----- both at once, and Cancel ----- */
await load(pg, DOC); await caretCell(pg, 0, 4, 2);
await pg.evaluate(() => { window.SAID = []; window.realConfirm = window.confirm; window.confirm = (m) => { SAID.push(m); return false; }; });
await paste(cells([['n1'], ['n2']]));
const said = await pg.evaluate(() => SAID);
check('one question covers both replacing and leaving out', said.length === 1 && /replaces what is in 1 cell\n/.test(said[0]) && /leaves out the last 1 row: the table has only 1 row from this cell down/.test(said[0]), said);
same('Cancel pastes nothing', await grid(), ['A|B|C', 'a1||c1', 'a2 <b>bold</b>||', 'a3||', 'a4||keep']);
check('and the page is not marked as changed', !(await dirty()));
await pg.evaluate(() => { window.confirm = window.realConfirm; });

/* ----- more than one column ----- */
await load(pg, DOC); await caretCell(pg, 0, 2, 1); n0 = dialogs.length;
await paste(cells([['p', 'q'], ['r', '<i>s</i>']]));
same('a block of rows and columns keeps its shape and its formatting', await grid(), ['A|B|C', 'a1||c1', 'a2 <b>bold</b>|p|q', 'a3|r|<i>s</i>', 'a4||keep']);
check('and did not ask, the cells being empty', dialogs.length === n0);
await caretCell(pg, 0, 1, 2); n0 = dialogs.length;
await paste(cells([['u', 'v', 'w']]));
check('columns that do not fit are left out too, after asking', /leaves out the last 2 columns: the table has only 1 column from this cell across/.test(dialogs[n0]) && /replaces what is in 1 cell/.test(dialogs[n0]) && (await grid())[1] === 'a1||u', [dialogs[n0], await grid()]);

/* ----- empty cells, header cells, other programs ----- */
await load(pg, DOC); await caretCell(pg, 0, 4, 0);
await paste(cells([['', 'filled']]));
same('an empty copied cell empties the cell it lands on', (await grid())[4], '|filled|keep');
await caretCell(pg, 0, 0, 1);
await paste(cells([['Head'], ['under']]));
check('a header cell takes the text and stays a header cell', await pg.evaluate(() => { const t = document.querySelector('#doc table'); return t.rows[0].cells[1].tagName === 'TH' && t.rows[0].cells[1].textContent === 'Head' && t.rows[1].cells[1].tagName === 'TD' && t.rows[1].cells[1].textContent === 'under'; }));
await load(pg, DOC); await caretCell(pg, 0, 1, 1);
await paste('<html><body><table style="border:1px solid red"><tr><td style="color:red"><span style="font-size:20px">from</span></td></tr><tr><td><b>sheet</b></td></tr></table></body></html>', 'from\nsheet');
same('cells copied in another program are spread the same way, with their styling removed', (await grid()).slice(1, 3), ['a1|from|c1', 'a2 <b>bold</b>|<b>sheet</b>|']);

/* ----- what is not a block ----- */
await load(pg, DOC); await caretCell(pg, 0, 1, 0); n0 = dialogs.length;
await paste(cells([['ONE']]));
check('one copied cell goes in at the cursor like text, without asking', (await grid())[1] === 'a1ONE||c1' && dialogs.length === n0, await grid());
await pg.evaluate(() => { const p = document.querySelector('#z'), r = document.createRange(); r.selectNodeContents(p); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); p.closest('[contenteditable=true]').focus(); document.dispatchEvent(new Event('selectionchange')); });
await sleep(60);
await paste(cells([['t1'], ['t2']]));
check('outside a table, a block of cells still arrives as a table of its own', await pg.evaluate(() => document.querySelectorAll('#doc table').length === 2 && [...document.querySelectorAll('#doc table')[1].rows].map(r => r.cells[0].textContent).join() === 't1,t2'));

check('no page errors', errors.length === 0, errors);
await b.close();
