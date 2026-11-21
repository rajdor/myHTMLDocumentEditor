// Notebook sorting and favourites: the notebook sort by name, modified date, size and type, either direction; a folder's
// own sort and the notebook sort clearing it; favourite pages by star and by menu, the block above the tree, opening
// from it, following rename and move, greying when the page has gone; all of it kept in .notebook/settings.json.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';

const { b, pg, errors } = await open();
await pg.evaluate(installMockFs);
const row = (p) => '.nb-row[title="' + p + '"]';
const rows = async (under = '') => (await pg.evaluate(() => FLE.NB.state.rows)).filter(p => under ? p.startsWith(under + '/') : !p.includes('/'));
const settings = async () => JSON.parse(await pg.evaluate(() => MFS.text(R, '.notebook/settings.json')) || '{}');
const items = () => pg.evaluate(() => [...document.querySelectorAll('#nb-menu button')].map(x => x.textContent));
const choose = async (item) => { const ok = await pg.evaluate((item) => { const b = [...document.querySelectorAll('#nb-menu button')].find(x => x.textContent.replace(/^✓ /, '') === item); if (b) b.click(); return !!b; }, item); await sleep(300); return ok; };
const sortBy = async (item) => { await pg.click('#nb button[data-nb="sort"]'); await sleep(100); return choose(item); };
const menu = async (p, item) => { await pg.click(row(p), { button: 'right' }); await sleep(100); return choose(item); };
const folderSort = async (p, item) => { await menu(p, 'Sort this folder'); await sleep(100); return choose(item); };
const favs = () => pg.evaluate(() => [...document.querySelectorAll('#nb-fav .nb-frow')].map(r => [r.textContent, r.title, r.className.replace('nb-frow', '').trim()]));
const star = async (p) => { await pg.hover(row(p)); await sleep(60); await pg.click(row(p) + ' .nb-star'); await sleep(300); };
const h1 = () => pg.evaluate(() => document.querySelector('#doc h1').textContent);
const msg = () => pg.evaluate(() => document.querySelector('#nb-msg').textContent);
const renameTo = async (p, name) => { await menu(p, 'Rename'); await pg.evaluate((n) => { document.querySelector('#nb-tree input').value = n; }, name); await pg.focus('#nb-tree input'); await pg.keyboard.press('Enter'); await sleep(400); };
const drag = async (from, to) => { await pg.evaluate((a, b) => { const s = document.querySelector(a), d = document.querySelector(b), dt = new DataTransfer(); s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }, row(from), row(to)); await sleep(400); };

await pg.evaluate(async () => {
  FLE.load('<main><h1>TITLE</h1><p>TITLE text</p></main>'); const tpl = FLE.build();
  window.PAGE = (t, more) => tpl.replace(/TITLE/g, t).replace('</main>', '<p>' + 'x'.repeat(more || 0) + '</p></main>');
  window.R = MFS.make({ Zeta: { 'deck.pptx': 'x', 'scan.pdf': 'y' }, Work: { 'One.html': PAGE('One', 900), 'Two.html': PAGE('Two', 300), 'Three.html': PAGE('Three', 600), Sub: { 'Deep.html': PAGE('Deep') } }, 'Beta.html': PAGE('Beta', 2000), 'alpha.html': PAGE('alpha', 10), 'Gamma.html': PAGE('Gamma', 1000), 'notes.md': '# Notes', 'data.csv': 'a,b', '.trash': {} }, 'Sorts');
  const day = 86400000, t0 = Date.now() - 30 * day;
  [['alpha.html', 3], ['Beta.html', 1], ['Gamma.html', 2], ['notes.md', 5], ['data.csv', 4], ['Work/One.html', 2], ['Work/Two.html', 3], ['Work/Three.html', 1]].forEach(([p, d]) => MFS.age(R, p, t0 + d * day));
  FLE.load('<main><h1>Untitled document</h1><p>Start writing.</p></main>');
  FLE.NB.toggle(true); await FLE.NB.openRoot(R, false, true);
});
await sleep(300);
const FILES = (r) => r.filter(p => /\.(html|md|csv)$/.test(p));

/* ----- Open in new browser tab is switched off for kinds of file the browser cannot show ----- */
await pg.click(row('Zeta')); await sleep(300);
const tabBtn = async (p) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const r = await pg.evaluate(() => { const b = [...document.querySelectorAll('#nb-menu button')].find(x => x.textContent === 'Open in new browser tab'); return b ? [b.disabled, b.title] : null; }); await pg.keyboard.press('Escape'); await sleep(60); return r; };
const off = await tabBtn('Zeta/deck.pptx'), on = await tabBtn('Zeta/scan.pdf');
check('for a PowerPoint file the item is shown but switched off, and says why', !!off && off[0] === true && /cannot show this kind of file/.test(off[1]), off);
check('for a PDF it works as before', !!on && on[0] === false && on[1] === '', on);
await pg.click(row('Zeta')); await sleep(300);

/* ----- the notebook sort ----- */
same('to start with: folders first, then files by name', await rows(), ['Work', 'Zeta', 'alpha.html', 'Beta.html', 'data.csv', 'Gamma.html', 'notes.md', '.trash']);
await pg.click('#nb button[data-nb="sort"]'); await sleep(100);
same('the Sort button lists the four sorts and the two directions, ticking the ones in use', await items(), ['✓ Name', 'Modified date', 'Size', 'Type', '✓ Ascending', 'Descending']);
await choose('Modified date');
same('by modified date, oldest first', FILES(await rows()), ['Beta.html', 'Gamma.html', 'alpha.html', 'data.csv', 'notes.md']);
same('folders stay first, by name, and the trash stays last', [(await rows()).slice(0, 2), (await rows()).slice(-1)], [['Work', 'Zeta'], ['.trash']]);
await sortBy('Descending');
same('descending: newest first', FILES(await rows()), ['notes.md', 'data.csv', 'alpha.html', 'Gamma.html', 'Beta.html']);
same('the choice is kept in the notebook settings', (await settings()).sort, { by: 'modified', desc: true });
await sortBy('Size');
same('by size, largest first', FILES(await rows()).slice(0, 3), ['Beta.html', 'Gamma.html', 'alpha.html']);
await sortBy('Ascending'); await sortBy('Type');
same('by type: grouped by extension, by name within each', FILES(await rows()), ['data.csv', 'alpha.html', 'Beta.html', 'Gamma.html', 'notes.md']);
await sortBy('Name'); await sortBy('Descending');
same('by name descending, folders too, still ahead of files', (await rows()).slice(0, 7), ['Zeta', 'Work', 'notes.md', 'Gamma.html', 'data.csv', 'Beta.html', 'alpha.html']);
await sortBy('Ascending');

/* ----- a folder's own sort ----- */
await pg.click(row('Work')); await sleep(300);
same('an opened folder follows the notebook sort', await rows('Work'), ['Work/Sub', 'Work/One.html', 'Work/Three.html', 'Work/Two.html']);
await folderSort('Work', 'Size');
same('Sort this folder sorts that folder alone', [await rows('Work'), FILES(await rows())], [['Work/Sub', 'Work/Two.html', 'Work/Three.html', 'Work/One.html'], ['alpha.html', 'Beta.html', 'data.csv', 'Gamma.html', 'notes.md']]);
same('and is kept in the settings under the folder path', (await settings()).folderSort, { Work: { by: 'size', desc: false } });
await menu('Work', 'Sort this folder'); await sleep(100);
same('the folder menu ticks its sort and offers the way back', await items(), ['Name', 'Modified date', '✓ Size', 'Type', '✓ Ascending', 'Descending', 'Use the notebook sort']);
await choose('Descending');
same('a direction for the folder alone', await rows('Work'), ['Work/Sub', 'Work/One.html', 'Work/Three.html', 'Work/Two.html'].slice(0, 1).concat(['Work/One.html', 'Work/Three.html', 'Work/Two.html']));
await renameTo('Work', 'Projects');
same('a renamed folder keeps its own sort', [(await settings()).folderSort, await rows('Projects')], [{ Projects: { by: 'size', desc: true } }, ['Projects/Sub', 'Projects/One.html', 'Projects/Three.html', 'Projects/Two.html']]);
await pg.evaluate(() => { const t0 = Date.now() - 30 * 86400000; [['One', 2], ['Two', 3], ['Three', 1]].forEach(([n, d]) => MFS.age(R, 'Projects/' + n + '.html', t0 + d * 86400000)); }); await pg.click('#nb button[data-nb="refresh"]'); await sleep(400);
await folderSort('Projects', 'Modified date'); await folderSort('Projects', 'Ascending');
same('by modified date inside the folder', await rows('Projects'), ['Projects/Sub', 'Projects/Three.html', 'Projects/One.html', 'Projects/Two.html']);
await pg.click(row('Projects/Two.html')); await sleep(300);
await pg.evaluate(() => { document.querySelector('#doc p').textContent = 'changed'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(50);
await pg.evaluate(() => MFS.age(R, 'Projects/Two.html', Date.now() - 40 * 86400000)); await pg.click('#nb button[data-nb="refresh"]'); await sleep(400);
same('a refresh reads the dates again', await rows('Projects'), ['Projects/Sub', 'Projects/Two.html', 'Projects/Three.html', 'Projects/One.html']);
await folderSort('Projects', 'Use the notebook sort');
same('Use the notebook sort takes the folder back', [(await settings()).folderSort, await rows('Projects')], [{}, ['Projects/Sub', 'Projects/One.html', 'Projects/Three.html', 'Projects/Two.html']]);
await folderSort('Projects', 'Size'); await sortBy('Type');
same('setting the notebook sort clears every folder sort', [(await settings()).folderSort, (await settings()).sort, await rows('Projects')], [{}, { by: 'type', desc: false }, ['Projects/Sub', 'Projects/One.html', 'Projects/Three.html', 'Projects/Two.html']]);
check('and says so', /whole notebook is sorted this way/.test(await msg()), await msg());
await sortBy('Name');

/* ----- favourites ----- */
check('with no favourites there is no Favourites block', await pg.$eval('#nb-fav', e => e.hidden));
check('pages carry a star; folders and other files do not', await pg.$eval(row('Beta.html'), e => !!e.querySelector('.nb-star')) && await pg.$eval(row('Projects'), e => !e.querySelector('.nb-star')) && await pg.$eval(row('data.csv'), e => !e.querySelector('.nb-star')) && await pg.$eval(row('notes.md'), e => !e.querySelector('.nb-star')));
await star('Beta.html');
same('the star makes the page a favourite, listed above the tree', await favs(), [['Beta.html', 'Beta.html', '']]);
check('the block sits above the tree', await pg.evaluate(() => document.querySelector('#nb-fav').getBoundingClientRect().bottom <= document.querySelector('#nb-tree').getBoundingClientRect().top + 1));
check('the star stays lit on the page row, and clicking it did not open the page', await pg.$eval(row('Beta.html') + ' .nb-star', e => e.classList.contains('on')) && await h1() === 'Two');
check('a folder menu has no favourite item', !(await (async () => { await pg.click(row('Zeta'), { button: 'right' }); await sleep(100); const i = await items(); await pg.keyboard.press('Escape'); return i; })()).some(x => /favourite/i.test(x)));
await menu('Projects/One.html', 'Add to favourites');
same('the right-click menu adds one too', (await favs()).map(f => f[1]), ['Beta.html', 'Projects/One.html']);
same('favourites are kept in the settings', (await settings()).favourites, ['Beta.html', 'Projects/One.html']);
await pg.evaluate(() => { document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await pg.click('#chrome button[data-a="save"]'); await sleep(400);
await pg.click('#nb-fav .nb-frow[title="Beta.html"]'); await sleep(400);
check('a click on a favourite opens the page and marks it', await h1() === 'Beta' && (await favs())[0][2] === 'is-cur', await favs());
await pg.click(row('Projects')); await sleep(200);
await pg.click('#nb-fav .nb-frow[title="Projects/One.html"]'); await sleep(400);
check('a favourite in a closed folder opens the folder and the page', await h1() === 'One' && (await rows('Projects')).includes('Projects/One.html'));
await renameTo('Projects/One.html', 'First');
same('a favourite follows its page when renamed', (await favs()).map(f => f.slice(0, 2)), [['Beta.html', 'Beta.html'], ['First.html', 'Projects/First.html']]);
await drag('Projects/First.html', 'Zeta');
same('and when moved', [(await favs()).map(f => f[1]), (await settings()).favourites], [['Beta.html', 'Zeta/First.html'], ['Beta.html', 'Zeta/First.html']]);
await renameTo('Zeta', 'Omega');
same('and when its folder is renamed', (await favs()).map(f => f[1]), ['Beta.html', 'Omega/First.html']);
await pg.click('#nb-fav .nb-fav-h'); await sleep(200);
check('the heading folds the list away, and the choice is kept', (await favs()).length === 0 && !(await pg.$eval('#nb-fav', e => e.hidden)) && (await settings()).favouritesOpen === false);
await pg.click('#nb-fav .nb-fav-h'); await sleep(200);
await pg.evaluate(() => MFS.drop(R, 'Beta.html')); await pg.click('#nb button[data-nb="refresh"]'); await sleep(500);
check('a favourite whose page has gone outside the editor is greyed', (await favs())[0][2] === 'is-gone' && (await favs())[0][1] === 'Beta.html (not found)', await favs());
await pg.click('#nb-fav .nb-frow'); await sleep(300);
check('clicking it says the page is no longer there', /no longer in the notebook/.test(await msg()), await msg());
await pg.click('#nb-fav .nb-frow .nb-star'); await sleep(300);
same('its star takes it out of favourites', [(await favs()).map(f => f[1]), (await settings()).favourites], [['Omega/First.html'], ['Omega/First.html']]);
await menu('Omega/First.html', 'Move to trash');
check('a page sent to the trash leaves favourites', (await favs()).length === 0 && (await settings()).favourites.length === 0 && await pg.$eval('#nb-fav', e => e.hidden));
check('pages in the trash carry no star', await (async () => { await pg.click(row('.trash')); await sleep(200); await pg.click(row('.trash/Omega')); await sleep(200); return pg.$eval(row('.trash/Omega/First.html'), e => !e.querySelector('.nb-star')); })());

/* ----- kept across a restart ----- */
await star('Gamma.html'); await pg.click(row('Projects')); await sleep(200); await folderSort('Projects', 'Size'); await sortBy('Descending');
await pg.evaluate(async () => { FLE.load('<main><h1>Untitled document</h1><p>Start writing.</p></main>'); await FLE.NB.openRoot(R, false, true); }); await sleep(400);
same('re-opening the notebook brings back the sort and the favourites', [FILES(await rows()), (await favs()).map(f => f[1])], [['notes.md', 'Gamma.html', 'data.csv', 'alpha.html'], ['Gamma.html']]);
check('none of it is in a saved page', await pg.evaluate(() => { const o = FLE.build(); return !/nb-fav|nb-star|Favourites/.test(o); }));
same('no page errors', errors, []);
await b.close();
