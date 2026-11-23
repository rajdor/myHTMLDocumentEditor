// Favourites in an order of the user's own: dragged up or down, moved from the right-click menu (Move to top, up, down,
// to bottom), or with Alt+Up and Alt+Down; the order is saved in the notebook settings and kept when the notebook is
// opened again; dragging a favourite moves nothing in the tree.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
const { b, pg, errors } = await open();
await pg.evaluate(installMockFs);
const favs = () => pg.evaluate(() => [...document.querySelectorAll('#nb-fav .nb-frow .nb-lbl')].map(x => x.textContent));
const saved = async () => (JSON.parse(await pg.evaluate(() => MFS.text(R, '.notebook/settings.json')) || '{}').favourites || []);
const items = () => pg.evaluate(() => [...document.querySelectorAll('#nb-menu button')].map(x => x.textContent));
const choose = async (item) => { await pg.evaluate((item) => [...document.querySelectorAll('#nb-menu button')].find(x => x.textContent === item).click(), item); await sleep(300); };
const frow = (name) => pg.evaluate((n) => [...document.querySelectorAll('#nb-fav .nb-frow')].findIndex(r => r.querySelector('.nb-lbl').textContent === n), name);
const rmenu = async (name) => { const i = await frow(name); await pg.click('#nb-fav .nb-frow[data-f="' + i + '"]', { button: 'right' }); await sleep(100); };
const drag = async (from, to, below) => { await pg.evaluate((a, b, below) => { const rs = [...document.querySelectorAll('#nb-fav .nb-frow')], s = rs.find(r => r.querySelector('.nb-lbl').textContent === a), d = rs.find(r => r.querySelector('.nb-lbl').textContent === b), dt = new DataTransfer(), r = d.getBoundingClientRect(), y = below ? r.bottom - 2 : r.top + 2;
  s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y })); d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt, clientY: y })); s.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt })); }, from, to, below); await sleep(300); };
await pg.evaluate(async () => {
  FLE.load('<main><h1>TITLE</h1><p>x</p></main>'); const tpl = FLE.build(), P = (t) => tpl.replace(/TITLE/g, t);
  window.R = MFS.make({ 'A.html': P('A'), 'B.html': P('B'), 'C.html': P('C'), Sub: { 'D.html': P('D') }, '.notebook': { 'settings.json': JSON.stringify({ favourites: ['A.html', 'B.html', 'C.html', 'Sub/D.html'] }) } }, 'Fav');
  FLE.NB.toggle(true); await FLE.NB.openRoot(R, false, true);
});
await sleep(300);
same('favourites start in the order they were added', await favs(), ['A.html', 'B.html', 'C.html', 'D.html']);
await drag('D.html', 'A.html', false);
same('a favourite dragged above another goes there', await favs(), ['D.html', 'A.html', 'B.html', 'C.html']);
await drag('A.html', 'C.html', true);
same('and one dragged below another goes after it', await favs(), ['D.html', 'B.html', 'C.html', 'A.html']);
same('the order is saved in the notebook settings', await saved(), ['Sub/D.html', 'B.html', 'C.html', 'A.html']);
same('dragging a favourite moved nothing in the folder', await pg.evaluate(() => MFS.paths(R).filter(p => !p.startsWith('.'))), ['A.html', 'B.html', 'C.html', 'Sub/', 'Sub/D.html']);
await rmenu('D.html'); const top = await items();
check('the first favourite\'s menu offers Move down and Move to bottom, not up', top.includes('Move down') && top.includes('Move to bottom') && !top.includes('Move up') && !top.includes('Move to top'), top);
await choose('Move to bottom');
same('Move to bottom', await favs(), ['B.html', 'C.html', 'A.html', 'D.html']);
await rmenu('A.html'); await choose('Move to top');
same('Move to top', await favs(), ['A.html', 'B.html', 'C.html', 'D.html']);
await rmenu('C.html'); await choose('Move up');
same('Move up', await favs(), ['A.html', 'C.html', 'B.html', 'D.html']);
await pg.evaluate(() => document.querySelector('#nb-fav .nb-frow[data-f="0"]').focus());
await pg.keyboard.down('Alt'); await pg.keyboard.press('ArrowDown'); await pg.keyboard.up('Alt'); await sleep(300);
same('Alt+Down moves the focused favourite down', await favs(), ['C.html', 'A.html', 'B.html', 'D.html']);
check('and it keeps the focus', await pg.evaluate(() => document.activeElement.matches('.nb-frow') && document.activeElement.querySelector('.nb-lbl').textContent === 'A.html'));
await pg.keyboard.down('Alt'); await pg.keyboard.press('ArrowUp'); await pg.keyboard.up('Alt'); await sleep(300);
same('Alt+Up moves it back up', await favs(), ['A.html', 'C.html', 'B.html', 'D.html']);
await pg.evaluate(async () => { await FLE.NB.openRoot(R, false, true); }); await sleep(300);
same('the order is kept when the notebook is opened again', await favs(), ['A.html', 'C.html', 'B.html', 'D.html']);
same('no page errors', errors, []);
await b.close();
