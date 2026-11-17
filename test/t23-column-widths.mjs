// Column widths: dragging the border between two columns moves width from one to the other and the table keeps its
// own width. Widths are saved as percentages, follow added and deleted columns, and a double-click on a border goes
// back to automatic widths.
import { open, check, same, caretCell, sleep, load, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead><tbody><tr><td>a1</td><td>b1</td><td>c1</td><td>d1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td><td>d2</td></tr></tbody></table></div><p id="z">Zed</p></main>';
const m = () => pg.evaluate(() => { const t = document.querySelector('#doc table'), tr = t.getBoundingClientRect(); return { table: Math.round(tr.width), cols: [...t.rows[1].cells].map(c => Math.round(c.getBoundingClientRect().width)), pct: [...t.querySelectorAll(':scope > colgroup > col')].map(c => parseFloat(c.style.width)), cw: t.classList.contains('cw'), left: Math.round(tr.left) }; });
const edge = (r, c, side = 'right') => pg.evaluate((r, c, side) => { const x = document.querySelector('#doc table').rows[r].cells[c].getBoundingClientRect(); return [side === 'right' ? x.right - 1 : x.left + 1, x.top + x.height / 2]; }, r, c, side);
const drag = async (from, dx) => { await pg.mouse.move(from[0], from[1]); await sleep(40); await pg.mouse.down(); await pg.mouse.move(from[0] + dx / 2, from[1], { steps: 3 }); await pg.mouse.move(from[0] + dx, from[1], { steps: 3 }); await pg.mouse.up(); await sleep(80); };
const near = (a, e, tol = 2) => Math.abs(a - e) <= tol;

await load(pg, DOC);
const a0 = await m();
check('a new table has automatic widths', !a0.cw && a0.pct.length === 0, a0);
// the pointer shows a border can be dragged
let p = await edge(1, 0); await pg.mouse.move(p[0], p[1]); await sleep(60);
check('over the border between two columns the pointer is a resize pointer', await pg.evaluate(() => document.getElementById('doc').classList.contains('ed-colrz') && getComputedStyle(document.querySelector('#doc td')).cursor === 'col-resize'));
await pg.mouse.move(p[0] - 40, p[1]); await sleep(60);
check('and not over the middle of a cell', await pg.evaluate(() => !document.getElementById('doc').classList.contains('ed-colrz')));
// drag the first border 60px to the right
await drag(await edge(1, 0), 60);
const a1 = await m();
check('dragging a border widens the column on its left by the distance dragged', near(a1.cols[0], a0.cols[0] + 60, 3), [a0.cols, a1.cols]);
check('and narrows the column on its right by the same', near(a1.cols[1], a0.cols[1] - 60, 3), [a0.cols, a1.cols]);
check('the other columns and the table itself keep their width', near(a1.cols[2], a0.cols[2]) && near(a1.cols[3], a0.cols[3]) && a1.table === a0.table && a1.left === a0.left, [a0, a1]);
check('the widths are stored as percentages that add up to 100', a1.cw && a1.pct.length === 4 && near(a1.pct.reduce((x, y) => x + y, 0), 100, 0.1), a1.pct);
check('dragging does not move the cursor into the table or select text', await pg.evaluate(() => getSelection().isCollapsed));
// a border can be dragged from the left edge of the next cell too, and in the heading row
await drag(await edge(0, 2, 'left'), -40);
const a2 = await m();
check('a border dragged left from the heading row narrows the column on its left', near(a2.cols[1], a1.cols[1] - 40, 3) && near(a2.cols[2], a1.cols[2] + 40, 3) && a2.table === a0.table, [a1.cols, a2.cols]);
// a column cannot be squeezed away
await drag(await edge(1, 0), -2000);
const a3 = await m();
check('a column cannot be dragged narrower than a small minimum', a3.cols[0] >= 26 && a3.cols[0] < 60 && a3.table === a0.table, a3.cols);
// the outer edges of the table are not column borders
const before = JSON.stringify((await m()).pct);
await drag(await edge(1, 3), -80); await drag(await edge(1, 0, 'left'), 80);
same('the outer edges of the table do not resize anything', JSON.stringify((await m()).pct), before);
// undo
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes the last resize back', (await m()).cols.map(v => Math.round(v / 3)), a2.cols.map(v => Math.round(v / 3)));
// saved and re-opened
await sleep(450); const saved = await pg.evaluate(() => FLE.build());
check('the saved document carries the widths and needs no script', /<table class="cw"><colgroup>(<col style="width: ?[\d.]+%;?">){4}<\/colgroup>/.test(saved) && !/<script/i.test(saved), saved.slice(saved.indexOf('<table'), saved.indexOf('<table') + 220));
await load(pg, saved); const a4 = await m();
same('and opens with the same widths', a4.cols.map(v => Math.round(v / 3)), a2.cols.map(v => Math.round(v / 3)));
// adding and deleting columns keeps the widths
await caretCell(pg, 0, 1, 0); await click(pg, 'c+'); await sleep(80);
const a5 = await m();
check('a column added beside another takes half its width; the rest stay', a5.pct.length === 5 && near(a5.pct[0], a4.pct[0] / 2, 0.2) && near(a5.pct[1], a4.pct[0] / 2, 0.2) && near(a5.pct[2], a4.pct[1], 0.2) && near(a5.pct.reduce((x, y) => x + y, 0), 100, 0.1) && a5.table === a0.table, [a4.pct, a5.pct]);
await caretCell(pg, 0, 1, 4); await click(pg, 'c-'); await sleep(80);
const a6 = await m();
check('deleting a column shares its width among the others, still adding up to 100', a6.pct.length === 4 && near(a6.pct.reduce((x, y) => x + y, 0), 100, 0.1) && a6.pct[2] > a5.pct[2] && a6.table === a0.table, [a5.pct, a6.pct]);
await caretCell(pg, 0, 1, 1); await click(pg, 'r+'); await sleep(80);
same('adding a row leaves the widths alone', (await m()).pct, a6.pct);
// headers and merges leave them alone too
await caretCell(pg, 0, 1, 0); await click(pg, 'hc'); await sleep(80); await click(pg, 'mr'); await sleep(80);
same('header and merge buttons leave the widths alone', (await m()).pct, a6.pct);
// double-click goes back to automatic
p = await edge(0, 1); await pg.mouse.click(p[0], p[1]); await pg.mouse.click(p[0], p[1], { clickCount: 2 }); await sleep(100);
const a7 = await m();
check('a double-click on a border goes back to automatic widths', !a7.cw && a7.pct.length === 0 && await pg.evaluate(() => !document.querySelector('#doc table').hasAttribute('class')), a7);
// fancy table
await load(pg, '<main><h1>T</h1><div class="tw"><table class="lop"><thead><tr><th><br></th><th>One</th><th>Two</th></tr></thead><tbody><tr><th scope="row">Label</th><td>x</td><td>y</td></tr></tbody></table></div></main>');
const f0 = await m(); await drag(await edge(1, 0), 50); const f1 = await m();
check('a fancy table resizes the same way', near(f1.cols[0], f0.cols[0] + 50, 3) && near(f1.cols[1], f0.cols[1] - 50, 3) && f1.table === f0.table, [f0.cols, f1.cols]);
same('no page errors', errors, []);
await b.close();
