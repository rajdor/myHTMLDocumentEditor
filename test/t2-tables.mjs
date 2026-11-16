// Table structure: rows, columns, merge (right, down, selection), split (merged and single), deletes around merged cells,
// and heading cells refusing to merge with body cells.
import { open, check, same, caretCell, click, shape, load, sleep, where } from './harness.mjs';
const { b, pg, dialogs } = await open({ prompt: '3,2' });
await load(pg, '<main><h1>T</h1><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th><th>D</th></tr></thead><tbody>' +
  [1, 2, 3, 4].map(r => '<tr>' + [1, 2, 3, 4].map(c => '<td>r' + r + 'c' + c + '</td>').join('') + '</tr>').join('') + '</tbody></table></div></main>');
same('start', await shape(pg), '. . . . | . . . . | . . . . | . . . . | . . . .');
await caretCell(pg, 0, 1, 1); await click(pg, 'mr'); same('merge right', await shape(pg), '. . . . | . c2 . | . . . . | . . . . | . . . .');
same('merged text kept on separate lines', await pg.evaluate(() => document.querySelector('#doc table').rows[1].cells[1].innerHTML), 'r1c2<br>r1c3');
await caretCell(pg, 0, 1, 1); await click(pg, 'md'); same('merge down extends the block', await shape(pg), '. . . . | . c2r2 . | . . | . . . . | . . . .');
await caretCell(pg, 0, 1, 1); await click(pg, 'c+'); same('add column after a merged block', await shape(pg), '. . . . . | . c2r2 . . | . . . | . . . . . | . . . . .');
await caretCell(pg, 0, 1, 1); await click(pg, 'r+'); same('add row under a merged block', await shape(pg), '. . . . . | . c2r2 . . | . . . | . . . . . | . . . . . | . . . . .');
await caretCell(pg, 0, 1, 1); await click(pg, 'split'); same('split a merged cell', await shape(pg), '. . . . . | . . . . . | . . . . . | . . . . . | . . . . . | . . . . .');
await caretCell(pg, 0, 2, 2); await click(pg, 'split'); same('split a single cell into two', await shape(pg), '. . c2 . . | . . c2 . . | . . . . . . | . . c2 . . | . . c2 . . | . . c2 . .');
await caretCell(pg, 0, 2, 2); await click(pg, 'c-'); same('delete column', await shape(pg), '. . . . . | . . . . . | . . . . . | . . . . . | . . . . . | . . . . .');
await caretCell(pg, 0, 3, 1); await click(pg, 'r-'); same('delete row', await shape(pg), '. . . . . | . . . . . | . . . . . | . . . . . | . . . . .');
same('after deleting a row the cursor is in the row below', await where(pg), '3:1');
await caretCell(pg, 0, 4, 2); await click(pg, 'r-'); same('after deleting the last row the cursor is in the row above', await where(pg), '3:2');
await click(pg, 'r+'); await sleep(50);
// merge a selected 2 x 2 block
await pg.evaluate(() => { const t = document.querySelector('#doc table'), a = t.rows[2].cells[1], z = t.rows[3].cells[2]; const r = document.createRange(); r.setStart(a, 0); r.setEnd(z, z.childNodes.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await click(pg, 'mr'); same('merge a selected block', await shape(pg), '. . . . . | . . . . . | . c2r2 . . | . . . | . . . . .');
await caretCell(pg, 0, 2, 1); await click(pg, 'split'); same('split the block back', await shape(pg), '. . . . . | . . . . . | . . . . . | . . . . . | . . . . .');
// heading and body never merge
const n = dialogs.length; await caretCell(pg, 0, 0, 1); await click(pg, 'md'); await sleep(50);
check('heading cell does not merge into the body', dialogs.length === n + 1 && /cannot be merged/.test(dialogs[n]), dialogs);
same('table unchanged after the refused merge', await shape(pg), '. . . . . | . . . . . | . . . . . | . . . . . | . . . . .');
// heading row cannot be deleted
await caretCell(pg, 0, 0, 1); await click(pg, 'r-'); same('heading row kept', await shape(pg), '. . . . . | . . . . . | . . . . . | . . . . . | . . . . .');
// Fancy Table inserts a labelled table
await caretCell(pg, 0, 1, 1); await click(pg, 'stage'); await sleep(100);
same('Fancy Table: heading row plus label column', await pg.evaluate(() => { const t = document.querySelectorAll('#doc table')[1]; return t.className + ' ' + [...t.rows].map(r => [...r.cells].map(c => c.tagName).join('')).join(' '); }), 'lop THTHTHTH THTDTDTD THTDTDTD');
// add row above and add column left
{
  const txt = () => pg.evaluate(() => [...document.querySelector('#doc table').rows].map(r => [...r.cells].map(c => c.textContent.trim() || '_').join(',')).join(' | '));
  await load(pg, '<main><h1>T</h1><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>a1</td><td rowspan="2">b12</td><td>c1</td></tr><tr><td>a2</td><td>c2</td></tr><tr><td colspan="2">ab3</td><td>c3</td></tr></tbody></table></div></main>');
  await caretCell(pg, 0, 1, 0); await click(pg, 'ra'); await sleep(50);
  same('add row above the first body row', await txt(), 'A,B,C | _,_,_ | a1,b12,c1 | a2,c2 | ab3,c3');
  same('the cursor is in the new row, same column', await where(pg), '1:0');
  await caretCell(pg, 0, 3, 0); await click(pg, 'ra'); await sleep(50);
  same('a row added inside a tall merged cell grows the merge', [await txt(), await shape(pg)], ['A,B,C | _,_,_ | a1,b12,c1 | _,_ | a2,c2 | ab3,c3', '. . . | . . . | . r3 . | . . | . . | c2 .']);
  const n0 = dialogs.length; await caretCell(pg, 0, 0, 1); await click(pg, 'ra'); await sleep(50);
  check('no row goes above the heading row', dialogs.length === n0 + 1 && /heading row/.test(dialogs[n0]) && (await shape(pg)) === '. . . | . . . | . r3 . | . . | . . | c2 .');
  await caretCell(pg, 0, 2, 2); await click(pg, 'cl'); await sleep(50);
  same('add column left', await txt(), 'A,B,Heading,C | _,_,_,_ | a1,b12,_,c1 | _,_,_ | a2,_,c2 | ab3,_,c3');
  check('the new heading cell is a heading, and the cursor is in the new column', await pg.evaluate(() => document.querySelector('#doc table').rows[0].cells[2].tagName === 'TH') && (await where(pg)) === '2:2', await where(pg));
  await caretCell(pg, 0, 2, 0); await click(pg, 'cl'); await sleep(50);
  same('add column left of the first column', await txt(), 'Heading,A,B,Heading,C | _,_,_,_,_ | _,a1,b12,_,c1 | _,_,_,_ | _,a2,_,c2 | _,ab3,_,c3');
  await caretCell(pg, 0, 1, 2); await click(pg, 'cl'); await sleep(50);
  same('a column added inside a wide merged cell grows the merge', await shape(pg), '. . . . . . | . . . . . . | . . . r3 . . | . . . . . | . . . . . | . c3 . .');
  await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(100);
  same('undo takes the column out again', await shape(pg), '. . . . . | . . . . . | . . r3 . . | . . . . | . . . . | . c2 . .');
}
await b.close();
