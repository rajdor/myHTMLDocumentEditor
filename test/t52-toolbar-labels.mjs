// The toolbar: labels under the groups, the Thin toolbar button to the right of Help, the table buttons grouped as
// add, delete, header, merge and format, and the header buttons' own icons (src/icons/).
import { open, load, caretCell, caretIn, check, same, sleep, DRAFT_KEY } from './harness.mjs';
const { b, pg, errors } = await open({ w: 1440, h: 700 });
const TABLE = '<main><h1>T</h1><p>Text</p><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td>1</td><td>2</td></tr><tr><td>3</td><td>4</td></tr></tbody></table></main>';
await load(pg, TABLE);
const sel = () => pg.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
const label = (q) => pg.evaluate((q) => { const e = document.querySelector(q); return e ? getComputedStyle(e, '::after').content.replace(/^"|"$|" \/ ""$/g, '').replace(/"$/, '') : null; }, q);
const state = () => pg.evaluate(() => ({ cls: document.querySelector('#chrome').className.trim(), h: document.querySelector('#chrome').offsetHeight, ch: document.documentElement.style.getPropertyValue('--ch') }));
const rows = () => pg.evaluate(() => new Set([...document.querySelectorAll('#tbar > *')].filter(x => x.offsetParent).map(x => Math.round(x.offsetTop / 20))).size);

/* labels under the groups */
for (const g of ['File', 'History', 'Text', 'Inspect', 'Lists', 'Insert', 'Notes', 'Index']) same('a label under the ' + g + ' group', await label('#tbar .grp[aria-label="' + g + '"]'), g);
same('the Table group is labelled under its two insert buttons', [await label('#tbar .grp[aria-label="Table"] > .tg'), await label('#tbar .grp[aria-label="Table"]')], ['Table', 'none']);
check('the labels take no width', await pg.evaluate(() => { const g = document.querySelector('#tbar .grp[aria-label="Index"]'), w = g.offsetWidth; document.querySelector('#chrome').classList.add('thin'); const w2 = g.offsetWidth; document.querySelector('#chrome').classList.remove('thin'); return w === w2; }));
same('the groups in order', await pg.evaluate(() => [...document.querySelectorAll('#tbar > .grp')].map(g => g.getAttribute('aria-label'))), ['File', 'History', 'Text', 'Inspect', 'Lists', 'Insert', 'Notes', 'Index', 'Table']);
same('Inspect holds the two buttons that look at the page without changing it; Text keeps the ones that change the text', await pg.evaluate(() => [[...document.querySelectorAll('#tbar .grp[aria-label="Inspect"] button')].map(x => x.dataset.a), [...document.querySelectorAll('#tbar .grp[aria-label="Text"] > *')].map(x => x.dataset.a || x.id)]), [['inspect', 'blocks'], ['s-block', 's-boxtype', 'bold', 'italic', 's-fmt', 'clear', 'paint']]);
const tall = await state();

/* in a table: the buttons by what they do, each set with its label */
await caretCell(pg, 0, 1, 0); await sel(); await sleep(200);
same('add, then delete, then header, merge and format', await pg.evaluate(() => [...document.querySelectorAll('#tbar .tops > .tg')].map(g => g.dataset.l + ': ' + [...g.querySelectorAll('button')].map(x => x.dataset.a).join(' '))),
  ['Add: ra r+ cl c+', 'Delete: r- c-', 'Header: hr sr hc sc', 'Merge: mr md split', 'Format: dense tfmt']);
same('each set has its label', await pg.evaluate(() => [...document.querySelectorAll('#tbar .tops > .tg')].map(g => getComputedStyle(g, '::after').content.replace(/"/g, '').replace(/ \/ $/, '').trim())), ['Add', 'Delete', 'Header', 'Merge', 'Format']);
same('a line between the sets', await pg.evaluate(() => document.querySelectorAll('#tbar .tops > .tsep').length), 4);
same('one row at 1440 wide with the table buttons showing', [await rows(), (await state()).cls], [1, '']);
check('the header buttons use the icons drawn for the editor', await pg.evaluate(() => ['hr', 'sr', 'hc', 'sc'].every(a => document.querySelectorAll('#tbar [data-a="' + a + '"] svg rect').length === 2)));
check('header is a solid bar, sub header a pale one', await pg.evaluate(() => { const f = a => document.querySelector('#tbar [data-a="' + a + '"] svg rect'); return ['hr', 'hc'].every(a => !f(a).hasAttribute('fill-opacity') && f(a).getAttribute('fill') === 'currentColor') && ['sr', 'sc'].every(a => f(a).getAttribute('fill-opacity') === '0.25'); }));
await pg.click('#tbar [data-a="hc"]'); await sleep(80);
same('the buttons still do their work: Header column', await pg.evaluate(() => [...document.querySelectorAll('#doc table tr')].map(r => r.cells[0].tagName).join(',')), 'TH,TH,TH');
await pg.click('#tbar [data-a="c+"]'); await sleep(80); await pg.click('#tbar [data-a="r-"]'); await sleep(80);
same('Add column right, then Delete row', await pg.evaluate(() => [...document.querySelectorAll('#doc table tr')].map(r => r.cells.length).join(',')), '3,3');

/* Thin toolbar: the button right of Help */
same('Thin toolbar is the last button, after Help', await pg.evaluate(() => [...document.querySelectorAll('#tbar .ends button')].map(x => x.dataset.a)), ['who', 'help', 'thin']);
await pg.click('#thin'); await sleep(150);
let s = await state();
check('Thin toolbar hides the labels and the toolbar is lower', s.cls === 'thin' && s.h < tall.h && s.ch === s.h + 'px' && await label('#tbar .grp[aria-label="File"]') === 'none', [tall, s]);
same('the button says it is on', await pg.$eval('#thin', x => x.getAttribute('aria-pressed')), 'true');
check('nothing in the page changed', !(await pg.evaluate(() => document.querySelector('#doc').innerHTML)).includes('thin'));
await pg.reload(); await sleep(600);
same('kept for next time, in this browser', (await state()).cls, 'thin');
await pg.click('#thin'); await sleep(150);
s = await state();
check('pressed again, the labels are back', s.cls === '' && await label('#tbar .grp[aria-label="File"]') === 'File' && await pg.$eval('#thin', x => x.getAttribute('aria-pressed')) === 'false', s);
await pg.evaluate((k) => { localStorage.removeItem(k); localStorage.removeItem(k.replace('-draft', '-thin')); }, DRAFT_KEY);

/* a narrow window: the toolbar wraps and the labels go */
await pg.setViewportSize ? await pg.setViewportSize({ width: 900, height: 700 }) : await pg.setViewport({ width: 900, height: 700 }); await sleep(300);
s = await state();
check('when the toolbar wraps to a second row the labels go', await rows() > 1 && s.cls === 'wrapped' && await label('#tbar .grp[aria-label="File"]') === 'none', s);
await pg.setViewportSize ? await pg.setViewportSize({ width: 1440, height: 700 }) : await pg.setViewport({ width: 1440, height: 700 }); await sleep(300);
check('and come back when it fits again', (await state()).cls === '' && await label('#tbar .grp[aria-label="File"]') === 'File');
check('no page errors', errors.length === 0, errors);
await b.close();
