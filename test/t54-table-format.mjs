// Table format: the bar opened under the toolbar from the Table format button. Cell colour for the cell the cursor is in or the
// selected cells (palette, recent, a custom colour with OK and Cancel, No colour), with white text where it reads
// better and links left in the browser's blue; spacing, padding, borders and corners for a whole table; empty cells in
// a table with spacing; fancy tables; Repeat, undo, Inspect formatting, save and re-open; the bar staying open.
import { open, load, caretCell, check, same, sleep } from './harness.mjs';
const { b, pg, errors } = await open({ w: 1440, h: 800 });
const sel = () => pg.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
const at = async (r, c, t = 0) => { await caretCell(pg, t, r, c); await sel(); await sleep(90); };
const styles = (t = 0) => pg.evaluate((t) => [...document.querySelectorAll('#doc table')[t].querySelectorAll('td,th')].map(c => c.getAttribute('style') || ''), t);
const cls = (t = 0) => pg.evaluate((t) => [...document.querySelectorAll('#doc table')[t].classList].sort().join(' '), t);
const hidden = () => pg.$eval('#tfmt', x => x.hidden);
const show = async () => { if (await hidden()) { await pg.click('#tbar [data-a="tfmt"]'); await sleep(140); } };
const swatch = (i, box = '#tf-pal') => pg.evaluate((i, box) => { const x = document.querySelectorAll(box + ' button')[i]; x.click(); return x.dataset.c; }, i, box);
const opt = async (k, v) => { await pg.click('#tfmt button[data-k="' + k + '"][data-v="' + v + '"]'); await sleep(100); };
const on = () => pg.evaluate(() => [...document.querySelectorAll('#tfmt button[data-k].on')].map(x => x.dataset.k + '=' + x.dataset.v).join(' '));
const css = (q, p) => pg.evaluate((q, p) => { const e = document.querySelector(q); return e ? getComputedStyle(e)[p] : null; }, q, p);
const typeHex = async (v) => { await pg.evaluate(() => { const h = document.querySelector('#tf-hex'); h.focus(); h.select(); }); await pg.keyboard.type(v); await sleep(80); };
const marks = () => pg.evaluate(() => [...document.querySelectorAll('#doc tbody td')].map(c => c.classList.contains('mt') ? 'mt' : '-').join(' '));
const DOC = '<main><h1>T</h1><p id="p">Before</p><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>a1 <a href="https://example.org/">a link</a></td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td><br></td><td><br></td></tr></tbody></table></div><p id="z">After</p></main>';
await pg.evaluate(() => { try { localStorage.removeItem('fle-cellcolours'); localStorage.removeItem('fln-cellcolours'); } catch (e) { } });
await load(pg, DOC);

/* the button and the panel */
check('Table format is with the table buttons, beside Compact, shown only in a table', await pg.evaluate(() => { const x = document.querySelector('#tbar .tops [data-a="tfmt"]'); return !!x && x.classList.contains('t') && x.previousElementSibling.dataset.a === 'dense' && document.querySelector('#tbar .tops').hidden; }));
await at(1, 0); await pg.click('#tbar [data-a="tfmt"]'); await sleep(150);
check('a bar opens under the toolbar, and the page moves down to make room: nothing is covered', !(await hidden()) && await pg.evaluate(() => { const p = document.querySelector('#tfmt').getBoundingClientRect(), tb = document.querySelector('#tbar').getBoundingClientRect(), ch = document.querySelector('#chrome'); return p.top >= tb.bottom - 1 && ch.contains(document.querySelector('#tfmt')) && document.documentElement.style.getPropertyValue('--ch') === ch.offsetHeight + 'px' && ch.offsetHeight > tb.height + 40 && document.querySelector('[data-a="tfmt"]').getAttribute('aria-expanded') === 'true'; }));
check('nothing in the bar runs over its edge', await pg.evaluate(() => { const p = document.querySelector('#tfmt').getBoundingClientRect(); return [...document.querySelectorAll('#tfmt button, #tfmt input')].every(x => { const r = x.getBoundingClientRect(); return r.right <= p.right && r.left >= p.left; }); }));
same('a palette of 52 colours: four steps of a grey and of twelve colours', await pg.evaluate(() => document.querySelectorAll('#tf-pal button').length), 52);
same('it says what the colour will go on, and shows the table as it is', [await pg.$eval('#tf-scope', x => x.textContent), await on()], ['The cell the cursor is in', 'gap= line= pad= corner=']);
same('one toolbar row at 1440 wide with the new button there', await pg.evaluate(() => new Set([...document.querySelectorAll('#tbar > *')].filter(x => x.offsetParent).map(x => Math.round(x.offsetTop / 20))).size + document.querySelector('#chrome').className), '1');

/* cell colour from the palette */
const c1 = await swatch(5); await sleep(120);
same('a click on a colour sets it on the cell the cursor is in', await styles(), ['', '', '', 'background-color:' + c1, '', '', '', '', '']);
check('saved as a hex colour', /^#[0-9A-F]{6}$/.test(c1));
check('the bar stays open, and the colour is marked', !(await hidden()) && await pg.evaluate((c) => document.querySelector('#tf-pal button.on').dataset.c === c, c1));
same('it is listed under Recent', await pg.evaluate(() => [...document.querySelectorAll('#tf-recent button')].map(x => x.dataset.c)), [c1]);
same('the cursor is still in the cell', await pg.evaluate(() => { const n = getSelection().anchorNode; return (n.nodeType === 1 ? n : n.parentElement).closest('td').textContent; }), 'a1 a link');

/* a dark colour: white text, links left alone */
const link0 = await css('#doc tbody td a', 'color');
const dark = await swatch(13 * 3 + 9); await sleep(120);
same('on a dark colour the cell takes white text', (await styles())[3], 'background-color:' + dark + ';color:#FFFFFF');
same('and its text is white', await css('#doc tbody td', 'color'), 'rgb(255, 255, 255)');
same('a link in it keeps the browser\'s own blue and underline', [await css('#doc tbody td a', 'color'), await css('#doc tbody td a', 'textDecorationLine')], [link0, 'underline']);
check('which is not the cell\'s white', link0 !== 'rgb(255, 255, 255)');

/* move to another cell with the bar open */
await at(1, 1);
check('the bar follows the cursor', !(await hidden()) && await pg.evaluate(() => !document.querySelector('#tf-pal button.on')) && (await pg.$eval('#tf-hex', x => x.value)) === '#FFFFFF');

/* custom colour: OK and Cancel */
await typeHex('#336699');
same('typing a colour changes nothing until OK', [(await styles())[4], await pg.$eval('#tf-color', x => x.value)], ['', '#336699']);
check('and nothing was typed into the page', !(await pg.evaluate(() => document.querySelector('#doc').textContent)).includes('336699'));
await pg.click('#tfmt [data-tf="cancel"]'); await sleep(100);
same('Cancel puts the box back and leaves the cell alone', [(await styles())[4], await pg.$eval('#tf-hex', x => x.value)], ['', '#FFFFFF']);
await typeHex('#eaf1f8'); await pg.click('#tfmt [data-tf="ok"]'); await sleep(140);
same('OK sets it', (await styles())[4], 'background-color:#EAF1F8');
await typeHex('blue'); await pg.keyboard.press('Enter'); await sleep(100);
check('something that is not a colour is refused, with the reason', (await styles())[4] === 'background-color:#EAF1F8' && /six characters/.test(await pg.$eval('#tf-err', x => x.textContent)));
await pg.click('#tfmt [data-tf="cancel"]'); await sleep(80);

/* Repeat, and a block of cells */
await at(1, 2); await pg.keyboard.down('Alt'); await pg.keyboard.press('KeyQ'); await pg.keyboard.up('Alt'); await sleep(150);
same('Repeat last toolbar command puts the last colour on the next cell', (await styles())[5], 'background-color:#EAF1F8');
await at(1, 1);
{ const p = await pg.evaluate(() => { const c = document.querySelector('#doc table').rows[2].cells[2].getBoundingClientRect(); return [c.left + c.width / 2, c.top + c.height / 2]; });
  await pg.keyboard.down('Shift'); await pg.mouse.click(p[0], p[1]); await pg.keyboard.up('Shift'); await sleep(150); }
same('four cells selected with Shift+click', await pg.evaluate(() => document.querySelectorAll('#doc .ed-cell').length), 4);
check('the bar is still open and says so', !(await hidden()) && (await pg.$eval('#tf-scope', x => x.textContent)) === '4 selected cells');
const c2 = await swatch(13 + 3); await sleep(120);
same('a colour goes on every selected cell', (await styles()).slice(4), ['background-color:' + c2, 'background-color:' + c2, '', 'background-color:' + c2, 'background-color:' + c2]);
await pg.click('#tfmt [data-tf="clear"]'); await sleep(120);
same('No colour takes it off them', (await styles()).slice(4), ['', '', '', '', '']);
await pg.keyboard.press('Escape'); await sleep(120);
check('Escape ends the cell selection first, and the bar stays open', !(await hidden()) && await pg.evaluate(() => document.querySelectorAll('#doc .ed-cell').length === 0) && (await pg.$eval('#tf-scope', x => x.textContent)) === 'The cell the cursor is in');

/* undo */
await at(2, 0); await sleep(500); const u0 = await styles(); await show(); const c3 = await swatch(2); await sleep(500);
check('set', (await styles())[6] === 'background-color:' + c3);
await pg.click('#tbar [data-a="undo"]'); await sleep(200);
same('one Undo takes a colour back', await styles(), u0);

/* the table: spacing, padding, borders, corners */
await at(1, 1); await show();
await opt('gap', 's');
same('Small spacing: the cells stand apart', [await cls(), await css('#doc table', 'borderCollapse'), await css('#doc table', 'borderSpacing')], ['gap-s', 'separate', '6px']);
await opt('gap', 'm');
same('Medium replaces Small', [await cls(), await css('#doc table', 'borderSpacing')], ['gap-m', '12px']);
await opt('pad', 'l'); same('Large padding', [await cls(), await css('#doc tbody td', 'paddingTop'), await css('#doc th', 'paddingLeft')], ['gap-m pad-l', '10px', '12px']);
await opt('pad', 's'); same('Small padding', [await cls(), await css('#doc tbody td', 'paddingTop')], ['gap-m pad-s', '3px']);
await opt('pad', ''); same('Normal padding is the table as it was', [await cls(), await css('#doc tbody td', 'paddingTop')], ['gap-m', '6px']);
await opt('line', 'none'); same('Borders, None: the lines are not drawn', [await cls(), await css('#doc tbody td', 'borderTopColor')], ['gap-m noline', 'rgba(0, 0, 0, 0)']);
await opt('line', ''); same('Borders, Grid', await cls(), 'gap-m');
await opt('corner', 'round'); same('Rounded corners', [await cls(), await css('#doc tbody td', 'borderTopLeftRadius')], ['gap-m round', '8px']);
same('the bar shows what is set', await on(), 'gap=m line= pad= corner=round');
await opt('gap', '');
same('no spacing turns Rounded off, as cells that touch cannot be round', [await cls(), await on()], ['', 'gap= line= pad= corner=']);
await opt('corner', 'round');
same('Rounded turns Small spacing on', [await cls(), await on()], ['gap-s round', 'gap=s line= pad= corner=round']);
check('Repeat names the last one', /Table corners: rounded/.test(await pg.$eval('[data-a="repeat"]', x => x.title)));

/* empty cells in a table with spacing */
same('a cell with no text and no colour is marked', await marks(), '- - - - mt mt');
same('and draws nothing', [await css('#doc td.mt', 'borderTopColor'), await css('#doc td.mt', 'backgroundColor')], ['rgba(0, 0, 0, 0)', 'rgba(0, 0, 0, 0)']);
await at(2, 1); await pg.keyboard.type('x'); await sleep(150);
same('typing in it brings it back', await marks(), '- - - - - mt');
await at(2, 2); await show(); await swatch(1); await sleep(120);
same('so does a colour', await marks(), '- - - - - -');
await pg.click('#tfmt [data-tf="clear"]'); await sleep(120);
same('and No colour marks it again', await marks(), '- - - - - mt');

/* the other table buttons still work in a table with spacing */
await at(1, 0); await pg.click('#tbar [data-a="c+"]'); await sleep(150);
same('Add column right', await pg.evaluate(() => [...document.querySelector('#doc table').rows].map(r => r.cells.length).join(',')), '4,4,4');
check('the bar is still open after a table button', !(await hidden()));
{ const p = await pg.evaluate(() => { const x = document.querySelector('#doc table').rows[1].cells[0].getBoundingClientRect(); return [x.right - 1, x.top + x.height / 2]; });
  await pg.mouse.move(p[0], p[1]); await sleep(60); await pg.mouse.down(); await pg.mouse.move(p[0] + 30, p[1], { steps: 3 }); await pg.mouse.move(p[0] + 60, p[1], { steps: 3 }); await pg.mouse.up(); await sleep(150);
  check('a column border can still be dragged', await pg.evaluate(() => document.querySelector('#doc table').classList.contains('cw'))); }

/* Inspect formatting */
await at(1, 0); await show(); const c6 = await swatch(5); await sleep(120); await pg.click('#tbar [data-a="inspect"]'); await sleep(200);
const rows = await pg.evaluate(() => [...document.querySelectorAll('#insp-list li')].map(li => li.querySelector('span').textContent + (li.classList.contains('odd') ? ' (odd)' : '')));
check('Inspect formatting names the table\'s format and the cell\'s colour', rows.includes('Table, set column widths, spacing small, corners rounded') && rows.includes('Cell colour ' + c6), rows);
await pg.evaluate(() => [...document.querySelectorAll('#insp-list li')].find(li => /^Cell colour/.test(li.querySelector('span').textContent)).querySelector('button').click()); await sleep(200);
same('and can take the colour off', await pg.evaluate(() => document.querySelector('#doc tbody td').getAttribute('style')), null);
await pg.keyboard.press('Escape'); await sleep(80);

/* saved and re-opened */
await at(1, 0); await show(); await swatch(13 * 3 + 9); await sleep(120);
const nmt = await pg.evaluate(() => document.querySelectorAll('#doc td.mt').length);
const saved = await pg.evaluate(() => FLE.build());
check('saved: classes on the table, the colour on the cell, the empty cell marked', /<table class="[^"]*\bgap-s\b[^"]*"/.test(saved) && /<table class="[^"]*\bround\b[^"]*"/.test(saved) && saved.includes('<td style="background-color:' + dark + ';color:#FFFFFF">') && /<td class="mt"><br><\/td>/.test(saved), (saved.match(/<table[^>]*>/) || [])[0]);
check('nothing of the editor is saved with it', !/ed-cell|tf-sw|id="tfmt"/.test(saved.slice(saved.indexOf('<body'))));
check('the saved page prints the colour', /\[style\*="background-color"\] \{ print-color-adjust: exact/.test(saved));
await load(pg, saved);
same('re-opened as it was', [await cls(), (await styles())[4], await pg.evaluate(() => document.querySelectorAll('#doc td.mt').length)], ['cw gap-s round', 'background-color:' + dark + ';color:#FFFFFF', nmt]);

/* the bar closes */
await at(1, 1); await show();
await pg.evaluate(() => { const p = document.querySelector('#z'), r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); await sel(); await sleep(200);
check('it closes when the cursor leaves the table', await hidden());
await at(1, 1); await show(); await pg.keyboard.press('Escape'); await sleep(120);
check('and with Escape', await hidden());
await show(); await pg.click('#tfmt [data-tf="close"]'); await sleep(120);
check('and with Close', await hidden());
await show(); await pg.click('#tbar [data-a="tfmt"]'); await sleep(120);
check('and with its own button, and the page moves back up', await hidden() && await pg.evaluate(() => document.querySelector('#chrome').offsetHeight < 70));

/* a fancy table keeps its own spacing, borders and corners; a cell in it can still have a colour */
await load(pg, '<main><h1>T</h1><table class="lop"><thead><tr><td><br></td><th>One</th></tr></thead><tbody><tr><th scope="row">Row</th><td>cell</td></tr></tbody></table></main>');
await at(1, 1); await show();
check('in a fancy table the table settings are off, and the bar says why', await pg.evaluate(() => [...document.querySelectorAll('#tfmt button[data-k]')].every(x => x.disabled) && !document.querySelector('#tf-fancy').hidden));
const c5 = await swatch(4); await sleep(120);
same('a cell colour still works there', (await styles())[3], 'background-color:' + c5);
check('no page errors', errors.length === 0, errors);
await b.close();
