// Documents made with grids (the older format) open as tables with the same content, and save as tables.
import { open, check, same, load, file } from './harness.mjs';
const { b, pg } = await open();
await load(pg, file('legacy-document.html'), 'legacy-document.html');
same('no grids left', await pg.evaluate(() => document.querySelectorAll('#doc div.lop, #doc div.spine').length), 0);
same('stage grid became a table', await pg.evaluate(() => { const t = document.querySelector('#doc table.lop'); return [...t.rows].map(r => r.cells.length); }), [5, 5, 5, 5, 5, 5]);
same('stage strips became tables', await pg.evaluate(() => document.querySelectorAll('#doc table.spine').length), 2);
same('headings and labels kept', await pg.evaluate(() => { const t = document.querySelector('#doc table.lop'); return [t.rows[0].cells[1].textContent, t.rows[1].cells[0].textContent, t.rows[1].cells[0].tagName]; }), ['Receive', 'Intent', 'TH']);
check('activity content kept', await pg.evaluate(() => document.querySelector('#doc table.lop').rows[2].cells[1].textContent.includes('Check the delivery')));
const html = await pg.evaluate(() => FLE.build());
check('saved document has no grids', !/class="(lop|spine)"[^>]*>\s*<div/.test(html) && !/<div class="lopw"/.test(html));
await b.close();
