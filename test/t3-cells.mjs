// Typing in table cells: Enter and Shift+Enter add a line in the cell, paste keeps lines in the cell, Tab moves right
// from the end of a line (nothing at the row end) and inserts spaces elsewhere, Shift+Tab moves left,
// Up and Down move between cells only from the first or last line.
import { open, check, same, caretCell, where, load, sleep } from './harness.mjs';
const { b, pg } = await open();
await load(pg, '<main><h1>T</h1><p>Before</p><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody>' +
  '<tr><td>one</td><td>two words here</td><td>three</td></tr><tr><td>four</td><td>five</td><td>six</td></tr></tbody></table></div><p>After</p></main>');
const K = pg.keyboard, cells = () => pg.evaluate(() => [...document.querySelector('#doc table').rows].map(r => r.cells.length).join(','));
await caretCell(pg, 0, 1, 0); await K.press('Enter'); await K.type('x'); await K.down('Shift'); await K.press('Enter'); await K.up('Shift'); await K.type('y');
same('Enter and Shift+Enter stay in the cell', await pg.evaluate(() => document.querySelector('#doc table').rows[1].cells[0].innerHTML), 'one<br>x<br>y');
same('no cells added', await cells(), '3,3,3');
await caretCell(pg, 0, 2, 0);
await pg.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'p1\np2'); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
same('multi-line paste stays in the cell', await pg.evaluate(() => document.querySelector('#doc table').rows[2].cells[0].innerHTML), 'fourp1<br>p2');
await caretCell(pg, 0, 1, 1); await K.press('Tab'); same('Tab at line end moves right', await where(pg), '1:2');
await K.press('Tab'); same('Tab at the row end stays', await where(pg), '1:2');
await K.down('Shift'); await K.press('Tab'); await K.up('Shift'); same('Shift+Tab moves left', await where(pg), '1:1');
await caretCell(pg, 0, 1, 1, false); await K.press('Tab');
same('Tab inside text inserts four spaces that do not collapse', await pg.evaluate(() => { const t = document.querySelector('#doc table').rows[1].cells[1].textContent; return [t.slice(4), /^[\u00a0 ]{4}$/.test(t.slice(0, 4)), !/  /.test(t)]; }), ['two words here', true, true]);
await caretCell(pg, 0, 1, 0, false); await K.press('ArrowUp'); same('Up from the first line moves up', await where(pg), '0:0');
await K.press('ArrowUp'); same('Up from the heading row leaves the table', await where(pg), 'outside:P');
await caretCell(pg, 0, 1, 0, false); await K.press('ArrowDown'); same('Down from the first of three lines stays in the cell', await where(pg), '1:0');
await caretCell(pg, 0, 1, 0, true); await K.press('ArrowDown'); same('Down from the last line moves down', await where(pg), '2:0');
await K.press('ArrowDown'); same('Down inside a two-line cell moves to its second line', await where(pg), '2:0');
await caretCell(pg, 0, 2, 0, true); await K.press('ArrowDown'); same('Down from the last row leaves the table', await where(pg), 'outside:P');
same('cell count unchanged', await cells(), '3,3,3');
await b.close();
