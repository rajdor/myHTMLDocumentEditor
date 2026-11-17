// Table headers and sub headers: four buttons set a whole row or column as a header or a sub header, and the same
// button again makes it ordinary. Any row can change, the top one included. New rows and columns start ordinary,
// except where a header column or header row runs through them.
import { open, check, same, caretCell, caretIn, sleep, load, click, ROOT } from './harness.mjs';
import path from 'path';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
// the table as kinds: H header, S sub header, . ordinary; scopes as c (column) or r (row)
const kinds = (t = 0) => pg.evaluate((t) => [...document.querySelectorAll('#doc table')[t].rows].map(r => [...r.cells].map(c => c.tagName === 'TH' ? (c.classList.contains('sub') ? 'S' : 'H') : '.').join('')).join(' '), t);
const scopes = (t = 0) => pg.evaluate((t) => [...document.querySelectorAll('#doc table')[t].rows].map(r => [...r.cells].map(c => c.tagName === 'TH' ? (c.getAttribute('scope') || '?')[0] : '.').join('')).join(' '), t);
const lit = () => pg.evaluate(() => ['hr', 'sr', 'hc', 'sc'].filter(a => document.querySelector('[data-a="' + a + '"]').classList.contains('on')).join(','));
const DOC = '<main><h1>T</h1><div class="tw"><table><thead><tr><th>A</th><th>B</th><th>C</th></tr></thead><tbody><tr><td>a1</td><td>b1</td><td>c1</td></tr><tr><td>a2</td><td>b2</td><td>c2</td></tr><tr><td>a3</td><td>b3</td><td>c3</td></tr></tbody></table></div><p id="z">Zed</p></main>';
const selCells = (r1, c1, r2, c2) => pg.evaluate((r1, c1, r2, c2) => { const t = document.querySelector('#doc table'), a = t.rows[r1].cells[c1], z = t.rows[r2].cells[c2], r = document.createRange(); r.setStart(a.firstChild, 0); r.setEnd(z.firstChild, 1); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('doc').focus(); }, r1, c1, r2, c2);

await load(pg, DOC);
same('a new table has a header row and ordinary cells', await kinds(), 'HHH ... ... ...');
check('the four header buttons are with the table buttons, shown only in a table', await pg.evaluate(() => ['hr', 'sr', 'hc', 'sc'].every(a => { const x = document.querySelector('#tbar .tops [data-a="' + a + '"]'); return x && x.classList.contains('t'); })));
// header column
await caretCell(pg, 0, 2, 0); await sleep(40); await click(pg, 'hc'); await sleep(60);
same('Header column makes the column headers in every ordinary row', await kinds(), 'HHH H.. H.. H..');
same('header cells say what they head: the top row its columns, the side column its rows', await scopes(), 'ccc r.. r.. r..');
same('the cell keeps its text and the cursor stays in it', await pg.evaluate(() => { const n = getSelection().anchorNode; return [(n.nodeType === 1 ? n : n.parentElement).closest('td,th').textContent, document.querySelector('#doc table').rows[2].cells[0].outerHTML]; }), ['a2', '<th scope="row">a2</th>']);
same('the Header column button is lit there', await lit(), 'hc');
// sub header column
await caretCell(pg, 0, 1, 1); await sleep(40); await click(pg, 'sc'); await sleep(60);
same('Sub header column makes the column sub headers', await kinds(), 'HHH HS. HS. HS.');
same('a sub header is a header cell with the sub class', await pg.evaluate(() => document.querySelector('#doc table').rows[1].cells[1].outerHTML), '<th class="sub" scope="row">b1</th>');
const look = await pg.evaluate(() => { const t = document.querySelector('#doc table'), f = c => getComputedStyle(c).backgroundColor; return [f(t.rows[0].cells[0]), f(t.rows[1].cells[0]), f(t.rows[1].cells[1]), f(t.rows[1].cells[2]), getComputedStyle(t.rows[1].cells[1]).fontWeight]; });
check('a sub header has a paler fill than a header, bold text, and an ordinary cell has none', look[0] === look[1] && look[2] !== look[1] && look[2] !== look[3] && look[4] === '600', look);
await click(pg, 'hc'); await sleep(60);
same('Header column on a sub header column switches it to header', await kinds(), 'HHH HH. HH. HH.');
await click(pg, 'hc'); await sleep(60);
same('and the same button again makes the column ordinary', await kinds(), 'HHH H.. H.. H..');
// sub header row, with a header column running through it
await caretCell(pg, 0, 2, 1); await sleep(40); await click(pg, 'sr'); await sleep(60);
same('Sub header row makes every cell in the row a sub header', await kinds(), 'HHH H.. SSS H..');
same('the Sub header row button is lit there', await lit(), 'sr');
await click(pg, 'sr'); await sleep(60);
same('turned off, the row is ordinary again but keeps its header column cell', await kinds(), 'HHH H.. H.. H..');
await click(pg, 'hr'); await sleep(60);
same('Header row works on a body row', await kinds(), 'HHH H.. HHH H..');
same('and its cells head their columns', await scopes(), 'ccc r.. ccc r..');
await click(pg, 'hr'); await sleep(60);
// the top row can change too
await caretCell(pg, 0, 0, 1); await sleep(40); await click(pg, 'sr'); await sleep(60);
same('the top row can be made a sub header', await kinds(), 'SSS H.. H.. H..');
await click(pg, 'sr'); await sleep(60);
same('and ordinary, keeping the cell the header column runs through', await kinds(), 'H.. H.. H.. H..');
await click(pg, 'hr'); await sleep(60);
same('and a header again', await kinds(), 'HHH H.. H.. H..');
// a selection covers several rows or columns
await load(pg, DOC); await selCells(1, 0, 2, 1); await sleep(40); await click(pg, 'sr'); await sleep(60);
same('with cells selected, the row buttons act on every row in the selection', await kinds(), 'HHH SSS SSS ...');
await selCells(3, 1, 3, 2); await sleep(40); await click(pg, 'hc'); await sleep(60);
same('and the column buttons on every column in it, leaving header rows as they are', await kinds(), 'HHH SSS SSS .HH');
// undo
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(120);
same('undo takes a header change back', await kinds(), 'HHH SSS SSS ...');
// new rows and columns
await load(pg, DOC); await caretCell(pg, 0, 1, 0); await click(pg, 'hc'); await sleep(40); await caretCell(pg, 0, 2, 1); await click(pg, 'sr'); await sleep(60);
same('set up: header column and a sub header row', await kinds(), 'HHH H.. SSS H..');
await caretCell(pg, 0, 2, 1); await click(pg, 'r+'); await sleep(60);
same('a row added below a sub header row is ordinary, with the header column carried down', await kinds(), 'HHH H.. SSS H.. H..');
await caretCell(pg, 0, 2, 1); await click(pg, 'ra'); await sleep(60);
same('and so is a row added above it', await kinds(), 'HHH H.. H.. SSS H.. H..');
await caretCell(pg, 0, 1, 0); await click(pg, 'c+'); await sleep(60);
same('a column added beside a header column is ordinary, with header rows carried across', await kinds(), 'HHHH H... H... SSSS H... H...');
check('new header cells in the top row say Heading; new sub header cells are empty', await pg.evaluate(() => { const t = document.querySelector('#doc table'); return t.rows[0].cells[1].textContent === 'Heading' && t.rows[3].cells[1].textContent === '' && t.rows[3].cells[1].classList.contains('sub'); }));
// merged cells follow
await load(pg, '<main><h1>T</h1><div class="tw"><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td rowspan="2">m</td><td>b1</td></tr><tr><td>b2</td></tr><tr><td colspan="2">wide</td></tr></tbody></table></div></main>');
await caretCell(pg, 0, 1, 0); await click(pg, 'hc'); await sleep(60);
same('a merged cell becomes a header and keeps its span', await pg.evaluate(() => { const c = document.querySelector('#doc table').rows[1].cells[0]; return [c.tagName, c.rowSpan, c.textContent]; }), ['TH', 2, 'm']);
// saved and re-opened; repeat
await load(pg, DOC); await caretCell(pg, 0, 1, 0); await click(pg, 'hc'); await sleep(40); await caretCell(pg, 0, 2, 1); await click(pg, 'sr'); await sleep(450);
const saved = await pg.evaluate(() => FLE.build());
check('headers and sub headers are saved', /<th scope="row">a1<\/th><td>b1<\/td>/.test(saved) && (saved.match(/<th [^>]*class="sub"[^>]*>[abc]2<\/th>/g) || []).length === 3 && !/<script/i.test(saved), saved.slice(saved.indexOf('<tbody>'), saved.indexOf('<tbody>') + 300));
await load(pg, saved); same('and open unchanged', await kinds(), 'HHH H.. SSS H..');
await caretCell(pg, 0, 1, 1); await click(pg, 'sc'); await sleep(60); await caretCell(pg, 0, 1, 2); await click(pg, 'repeat'); await sleep(80);
same('Repeat sets the next column as a sub header column', await kinds(), 'HHH HSS SSS HSS');
await click(pg, 'repeat'); await sleep(80);
same('and sets, not toggles: repeating on it again leaves it', await kinds(), 'HHH HSS SSS HSS');
// fancy table: its side labels already are a header column
await load(pg, '<main><h1>T</h1><div class="tw"><table class="lop"><thead><tr><th><br></th><th>One</th><th>Two</th></tr></thead><tbody><tr><th scope="row">Label</th><td>x</td><td>y</td></tr><tr><th scope="row">Label</th><td>x</td><td>y</td></tr></tbody></table></div></main>');
await caretCell(pg, 0, 1, 0); await sleep(60);
same('in a fancy table the label column shows as a header column', await lit(), 'hc');
await caretCell(pg, 0, 1, 1); await click(pg, 'c+'); await sleep(60);
same('a column added to a fancy table is ordinary below the heading', await kinds(), 'HHHH H... H...');
await pg.screenshot({ path: path.join(ROOT, 'test', 'out', 'table-headers.png'), clip: { x: 0, y: 0, width: 1440, height: 330 } });
check('the toolbar is still one row in a table, with Help at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return t.right - h.right < 20 && h.top - t.top < 20; }));
same('no page errors', errors, []);
await b.close();
