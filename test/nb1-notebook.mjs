// Notebook explorer: panel, tree, opening pages, the Save / Discard / Cancel prompt, first save named from the H1,
// name clashes, rename, move, trash, restore, changes made outside the editor, import, read-only mode.
import { open, sleep, check, same, waitFor } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';

const { b, pg, errors, dialogs } = await open();
await pg.evaluate(installMockFs);
const row = (p) => '.nb-row[title="' + p + '"]';
const state = () => pg.evaluate(() => FLE.NB.state);
const paths = () => pg.evaluate(() => MFS.paths(R));
const text = (p) => pg.evaluate((p) => MFS.text(R, p), p);
const h1 = () => pg.evaluate(() => document.querySelector('#doc h1').textContent);
const msg = () => pg.evaluate(() => document.querySelector('#nb-msg').textContent);
const setH1 = async (t) => { await pg.evaluate((t) => { const h = document.querySelector('#doc h1'); h.textContent = t; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }, t); await sleep(50); };
const dirty = () => pg.evaluate(() => document.querySelector('[data-a="save"]').classList.contains('has'));
const clickRow = async (p) => { await pg.click(row(p)); await sleep(250); };
const menu = async (p, item) => { await pg.click(p ? row(p) : '#nb-tree', p ? { button: 'right' } : { button: 'right', offset: { x: 100, y: 700 } }); await sleep(100); const ok = await pg.evaluate((item) => { const b = [...document.querySelectorAll('#nb-menu button')].find(x => x.textContent === item); if (b) b.click(); return !!b; }, item); await sleep(300); return ok; };
const menuItems = async (p) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const v = await pg.evaluate(() => [...document.querySelectorAll('#nb-menu button')].map(x => x.textContent)); await pg.keyboard.press('Escape'); await sleep(50); if (!(await pg.$eval('#nb-menu', e => e.hidden))) throw new Error('menu did not close on Esc'); return v; };
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(350); };
const dlgOpen = (id) => pg.evaluate((id) => document.querySelector(id).open, id);
const drag = async (from, to) => { await pg.evaluate((a, b) => { const s = document.querySelector(a), d = document.querySelector(b), dt = new DataTransfer(); s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }, row(from), to === '' ? '#nb-tree' : row(to)); await sleep(350); };
const renameTo = async (p, name) => { await menu(p, 'Rename'); await pg.evaluate((n) => { const i = document.querySelector('#nb-tree input'); i.value = n; }, name); await pg.focus('#nb-tree input'); await pg.keyboard.press('Enter'); await sleep(350); };

/* ----- panel and landing ----- */
check('panel is hidden at start', await pg.$eval('#nb', e => e.hidden));
check('a tab at the left edge offers the explorer, and the toolbar has no notebook button', await pg.$eval('#nb-tab', e => !e.hidden && e.getBoundingClientRect().left === 0) && !(await pg.$('#tbar [data-a="nb"]')));
await pg.click('#nb-tab'); await sleep(100);
check('the tab shows the panel and steps aside', await pg.$eval('#nb', e => !e.hidden) && await pg.$eval('html', e => e.classList.contains('nb-open')) && await pg.$eval('#nb-tab', e => e.hidden));
check('landing screen is shown before a folder is chosen', await pg.$eval('#nb-land', e => !e.hidden && /folder/.test(e.textContent)) && await pg.$eval('#nb-tree', e => e.hidden));
await pg.click('#nb button[data-nb="hide"]'); await sleep(100);
check('the arrows in the panel hide it again and the tab returns', await pg.$eval('#nb', e => e.hidden) && await pg.$eval('html', e => !e.classList.contains('nb-open')) && await pg.$eval('#nb-tab', e => !e.hidden));

/* ----- open a notebook ----- */
await pg.evaluate(async () => {
  FLE.load('<main><h1>TITLE</h1><p>TITLE text</p></main>'); const tpl = FLE.build();
  const page = (t) => tpl.replace(/TITLE/g, t);   // a complete editor page, made without touching the open document
  window.PAGE = page;
  const spec = { Work: { 'Alpha.html': page('Alpha'), 'notes.txt': 'plain notes', Sub: { 'Deep.html': page('Deep') } }, 'Beta.html': page('Beta'), 'foreign.html': '<html><body><h1>Foreign</h1><p>from elsewhere</p></body></html>', 'readme.md': '# readme', 'picture.png': 'png', '.dotfile': 'x', '.trash': {}, '_templates': {} };
  window.R = MFS.make(spec, 'MyNotes');
  const d = document.querySelector('#doc'); d.innerHTML = '<h1>Untitled document</h1><p>Start writing.</p>';
  FLE.NB.toggle(true); await FLE.NB.openRoot(R, false, true);
});
await sleep(200);
let s = await state();
same('tree lists folders first, then files by name, special folders pinned last', s.rows, ['Work', '.dotfile', 'Beta.html', 'foreign.html', 'picture.png', 'readme.md', '_templates', '.trash']);
check('notebook name is shown', await pg.$eval('#nb-name', e => e.textContent === 'MyNotes'));
check('the unsaved starting page shows as a new page in the notebook folder', s.cur && s.cur.dir === '' && s.cur.node === null && await pg.$eval('.nb-row.is-new', e => /New page/.test(e.textContent)));
check('page rows show the name without .html; other files are greyed', await pg.$eval(row('Beta.html'), e => e.textContent === 'Beta' && e.classList.contains('k-page')) && await pg.$eval(row('picture.png'), e => e.classList.contains('k-other') && e.textContent === 'picture.png'));
check('a row has its path as a tooltip', await pg.$eval(row('Beta.html'), e => e.title === 'Beta.html'));

/* ----- hidden files ----- */
await pg.click('#nb button[data-nb="hidden"]'); await sleep(300);
s = await state();
check('hidden files can be switched off; .trash stays reachable', !s.rows.includes('.dotfile') && s.rows.includes('.trash'), s.rows);
check('the choice is saved in .notebook/settings.json', /"showHidden": false/.test(await text('.notebook/settings.json') || ''));
await pg.click('#nb button[data-nb="hidden"]'); await sleep(300);
s = await state();
check('hidden files shown again, with .notebook listed as a hidden folder', s.rows.includes('.dotfile') && s.rows.includes('.notebook'), s.rows);

/* ----- folders load when expanded; open a page ----- */
await clickRow('Work');
s = await state();
check('a folder shows its content when expanded', ['Work/Sub', 'Work/Alpha.html', 'Work/notes.txt'].every(p => s.rows.includes(p)), s.rows);
await clickRow('Work/Sub');
check('folders nest to any depth', (await state()).rows.includes('Work/Sub/Deep.html'));
await clickRow('Work/Alpha.html');
s = await state();
check('clicking a page opens it', await h1() === 'Alpha' && s.cur.node === 'Work/Alpha.html' && await pg.$eval(row('Work/Alpha.html'), e => e.classList.contains('is-cur')));
check('an opened page is not marked as changed', !(await dirty()));
await clickRow('picture.png');
check('clicking a greyed file does nothing to the open page', await h1() === 'Alpha' && (await state()).cur.node === 'Work/Alpha.html');
same('a greyed file offers Open in new browser tab', (await menuItems('picture.png')).filter(x => /browser tab/.test(x)), ['Open in new browser tab']);

/* ----- switching with unsaved changes ----- */
await setH1('Alpha edited');
check('editing marks the page as changed', await dirty());
await clickRow('Beta.html');
check('switching with unsaved changes asks first', await dlgOpen('#nb-ask'));
same('the prompt offers Save, Discard and Cancel', await pg.$$eval('#nb-ask button', bs => bs.map(x => x.textContent)), ['Save and switch', 'Discard and switch', 'Cancel']);
await pg.click('#nb-ask button[value="cancel"]'); await sleep(250);
check('Cancel stays on the page with its changes', await h1() === 'Alpha edited' && (await state()).cur.node === 'Work/Alpha.html' && await dirty());
await clickRow('Beta.html'); await pg.click('#nb-ask button[value="discard"]'); await sleep(350);
check('Discard switches and leaves the file on disk unchanged', await h1() === 'Beta' && /<h1>Alpha<\/h1>/.test(await text('Work/Alpha.html')));
await setH1('Beta edited');
await clickRow('Work/Alpha.html'); await pg.click('#nb-ask button[value="save"]'); await sleep(450);
check('Save and switch writes the page, then switches', await h1() === 'Alpha' && /<h1>Beta edited<\/h1>/.test(await text('Beta.html')) && !(await dirty()));
check('saving a page keeps its file name when the title changes', (await paths()).includes('Beta.html') && !(await paths()).includes('Beta edited.html'));

/* ----- new page: exists in memory until first saved, then named from the H1 ----- */
check('folder menu offers New page here', await menu('Work', 'New page here'));
s = await state();
check('a new page belongs to the chosen folder and has no file yet', s.cur.dir === 'Work' && s.cur.node === null && await h1() === 'Untitled document' && !(await paths()).some(p => /Untitled/.test(p)));
await setH1('Gamma: plan / v2');
await save();
check('first save names the file from the H1, without characters a file name cannot have', (await paths()).includes('Work/Gamma plan v2.html') && (await state()).cur.node === 'Work/Gamma plan v2.html', await paths());
check('the saved page is a complete editor document', /<meta name="generator" content="fine-line-editor">/.test(await text('Work/Gamma plan v2.html')));
await setH1('Gamma renamed in the text');
await save();
check('later saves keep the file name', (await paths()).includes('Work/Gamma plan v2.html') && !(await paths()).some(p => /renamed in the text/.test(p)) && /Gamma renamed in the text/.test(await text('Work/Gamma plan v2.html')));

/* ----- first save when the name is taken ----- */
await menu('Work', 'New page here'); await setH1('alpha'); await save();
check('first save with a name already used asks (names compared ignoring case)', await dlgOpen('#nb-clash') && await pg.$eval('#nb-clash-n', e => e.value === 'alpha 2'));
await pg.$eval('#nb-clash-n', e => { e.value = 'Gamma plan v2'; }); await pg.click('#nb-clash button[value="rename"]'); await sleep(300);
check('a second name that is also taken is refused', await dlgOpen('#nb-clash') && await pg.$eval('#nb-clash-e', e => /also used/.test(e.textContent)));
await pg.$eval('#nb-clash-n', e => { e.value = 'Delta'; }); await pg.click('#nb-clash button[value="rename"]'); await sleep(400);
check('a free name saves the page under it', (await paths()).includes('Work/Delta.html') && (await state()).cur.node === 'Work/Delta.html' && /<h1>Alpha<\/h1>/.test(await text('Work/Alpha.html')));
await menu('Work', 'New page here'); await setH1('Alpha'); await save(); await pg.click('#nb-clash button[value="cancel"]'); await sleep(300);
check('Cancel leaves the page unsaved and the existing file untouched', await dirty() && (await state()).cur.node === null && /Alpha text/.test(await text('Work/Alpha.html')));
await pg.evaluate(() => { document.querySelector('#doc p').textContent = 'replacement body'; });
await save(); await pg.click('#nb-clash button[value="replace"]'); await sleep(400);
check('Replace existing overwrites the file', /replacement body/.test(await text('Work/Alpha.html')) && (await state()).cur.node === 'Work/Alpha.html');

/* ----- rename ----- */
await menu('Work/Delta.html', 'Rename');
check('Rename edits the name in the row', await pg.$eval('#nb-tree input', e => e.value === 'Delta'));
await pg.focus('#nb-tree input'); await pg.keyboard.press('End'); await pg.keyboard.type(' ALPH'); await sleep(100);
check('typing is never blocked', await pg.$eval('#nb-tree input', e => e.value === 'Delta ALPH') && !/already/.test(await msg()));
await pg.$eval('#nb-tree input', e => { e.value = 'ALPHA'; }); await pg.keyboard.press('Enter'); await sleep(350);
check('a clashing name is refused on Enter and the box stays open', /already in this folder/.test(await msg()) && !!(await pg.$('#nb-tree input')) && (await paths()).includes('Work/Delta.html'));
await pg.$eval('#nb-tree input', e => { e.value = 'Epsilon'; }); await pg.focus('#nb-tree input'); await pg.keyboard.press('Enter'); await sleep(350);
check('a free name renames the file and keeps .html', (await paths()).includes('Work/Epsilon.html') && !(await paths()).includes('Work/Delta.html'));
await menu('Work/Epsilon.html', 'Rename'); await pg.focus('#nb-tree input'); await pg.keyboard.press('Escape'); await sleep(200);
check('Esc cancels a rename', !(await pg.$('#nb-tree input')) && (await paths()).includes('Work/Epsilon.html'));
await renameTo('Work/Alpha.html', 'Alpha one');
s = await state();
check('renaming the open page keeps it open under the new name', s.cur.node === 'Work/Alpha one.html' && await h1() === 'Alpha');
await pg.evaluate(() => { document.querySelector('#doc p').textContent = 'after rename'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); });
await save();
check('and it then saves to the renamed file', /after rename/.test(await text('Work/Alpha one.html')) && !(await paths()).includes('Work/Alpha.html'));
await renameTo('Work', 'Projects');
s = await state();
check('renaming a folder carries its content and the open page', (await paths()).includes('Projects/Sub/Deep.html') && (await paths()).includes('Projects/notes.txt') && !(await paths()).some(p => p.startsWith('Work/')) && s.cur.node === 'Projects/Alpha one.html', await paths());
await pg.evaluate(() => { document.querySelector('#doc p').textContent = 'after folder rename'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); });
await save();
check('a page saves into its renamed folder', /after folder rename/.test(await text('Projects/Alpha one.html')));
same('special folders cannot be renamed or deleted', await menuItems('_templates'), ['New page here', 'New folder here']);

/* ----- new folder ----- */
await pg.click(row('Projects')); await sleep(200); if (!(await state()).rows.includes('Projects/Sub')) { await pg.click(row('Projects')); await sleep(200); }
await pg.click('#nb button[data-nb="newfolder"]'); await sleep(300);
check('New folder is created in the selected folder and opens for naming', (await paths()).includes('Projects/New folder/') && await pg.$eval('#nb-tree input', e => e.value === 'New folder'));
await pg.$eval('#nb-tree input', e => { e.value = 'Archive'; }); await pg.keyboard.press('Enter'); await sleep(350);
check('the new folder takes the typed name', (await paths()).includes('Projects/Archive/') && !(await paths()).includes('Projects/New folder/'));

/* ----- move by drag ----- */
await drag('Beta.html', 'Projects/Archive');
check('dragging a page onto a folder moves it', (await paths()).includes('Projects/Archive/Beta.html') && !(await paths()).includes('Beta.html'), await paths());
await pg.evaluate(() => MFS.put(R, 'Beta.html', PAGE('Beta two'))); await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
await drag('Beta.html', 'Projects/Archive');
check('a move that would clash is refused', /already in "Archive"/.test(await msg()) && (await paths()).includes('Beta.html') && /Beta edited/.test(await text('Projects/Archive/Beta.html')));
await drag('Projects/Archive', 'Projects/Sub');
check('a folder moves with its content', (await paths()).includes('Projects/Sub/Archive/Beta.html') && !(await paths()).includes('Projects/Archive/'));
await drag('Projects/Sub/Archive/Beta.html', '');
check('dropping on the empty part of the tree would clash at the top level and is refused', (await paths()).includes('Projects/Sub/Archive/Beta.html') && /already in the notebook folder/.test(await msg()));
await drag('Projects/Sub/Deep.html', '');
check('dropping on the empty part of the tree moves to the notebook folder', (await paths()).includes('Deep.html') && !(await paths()).includes('Projects/Sub/Deep.html'));

/* ----- trash and restore ----- */
await menu('Projects/Epsilon.html', 'Move to trash');
check('delete moves the page to .trash, keeping its path', (await paths()).includes('.trash/Projects/Epsilon.html') && !(await paths()).includes('Projects/Epsilon.html'));
await pg.evaluate(() => MFS.put(R, 'Projects/Epsilon.html', PAGE('Epsilon again'))); await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
await menu('Projects/Epsilon.html', 'Move to trash');
check('a second delete of the same path keeps both, the later one date-stamped', (await paths()).filter(p => /^\.trash\/Projects\/Epsilon/.test(p)).length === 2, (await paths()).filter(p => /^\.trash/.test(p)));
const n0 = dialogs.length;
await menu('Projects/Alpha one.html', 'Move to trash');
s = await state();
check('deleting the open page leaves a blank new page in its folder', (await paths()).includes('.trash/Projects/Alpha one.html') && await h1() === 'Untitled document' && s.cur.node === null && s.cur.dir === 'Projects' && dialogs.length === n0);
await clickRow('.trash'); await clickRow('.trash/Projects');
same('an item in the trash offers Restore, Open and Delete permanently', await menuItems('.trash/Projects/Alpha one.html'), ['Restore', 'Open', 'Delete permanently']);
await menu('.trash/Projects/Alpha one.html', 'Restore');
check('Restore puts the page back where it was', (await paths()).includes('Projects/Alpha one.html') && !(await paths()).includes('.trash/Projects/Alpha one.html'));
await drag('.trash/Projects/Epsilon.html', 'Projects');
check('dragging out of the trash restores too', (await paths()).includes('Projects/Epsilon.html'));
await drag('Deep.html', '.trash');
check('dragging onto the trash deletes', (await paths()).includes('.trash/Deep.html') && !(await paths()).includes('Deep.html'));
await menu('.trash/Deep.html', 'Delete permanently');
check('Delete permanently asks, then removes the item', !(await paths()).includes('.trash/Deep.html') && /permanently/.test(dialogs[dialogs.length - 1]));
await menu('.trash', 'Empty trash');
check('Empty trash asks, then clears the trash', (await paths()).filter(p => p.startsWith('.trash')).join() === '.trash/' && /Delete everything in the trash/.test(dialogs[dialogs.length - 1]));

/* ----- changes made outside the editor ----- */
await clickRow('Projects/Alpha one.html');
await pg.evaluate(() => MFS.put(R, 'Projects/Alpha one.html', MFS.text(R, 'Projects/Alpha one.html')));
await setH1('Alpha touched'); const n2 = dialogs.length; await save();
check('a file whose date changed but whose content did not saves without asking', dialogs.length === n2 && /Alpha touched/.test(await text('Projects/Alpha one.html')));
await pg.evaluate(() => MFS.put(R, 'Projects/Alpha one.html', PAGE('Changed elsewhere')));
await setH1('Alpha mine'); const n1 = dialogs.length; await save();
check('saving over a file changed on disk asks first', dialogs.length === n1 + 1 && /changed on disk/.test(dialogs[n1]) && /Alpha mine/.test(await text('Projects/Alpha one.html')));
await pg.evaluate(() => MFS.put(R, 'Projects/Added outside.html', PAGE('Added outside'))); await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
check('Refresh shows files added outside the editor', (await state()).rows.includes('Projects/Added outside.html'));
await pg.evaluate(() => MFS.drop(R, 'Projects/Alpha one.html')); await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
s = await state(); check('an open page removed outside the editor is kept as an unsaved page', s.cur.node === null && await dirty() && await h1() === 'Alpha mine' && /outside the editor/.test(await msg()));
await save();
check('and Save puts it back in the folder', (await paths()).includes('Projects/Alpha mine.html'));

/* ----- import of other HTML ----- */
await clickRow('foreign.html');
s = await state(); check('other HTML opens as an import, not tied to the original file', await h1() === 'Foreign' && s.cur.node === null && /Imported foreign.html/.test(await msg()));
await setH1('Foreign'); await save();
check('the import clashes with its own original name here, so it asks', await dlgOpen('#nb-clash'));
await pg.$eval('#nb-clash-n', e => { e.value = 'Foreign imported'; }); await pg.click('#nb-clash button[value="rename"]'); await sleep(400);
check('the original file is unchanged after the import is saved', await text('foreign.html') === '<html><body><h1>Foreign</h1><p>from elsewhere</p></body></html>' && (await paths()).includes('Foreign imported.html'));

/* ----- import of Markdown and plain text ----- */
const MD = '---\npageid: x1\ntitle: From front matter\n---\n## Tasks\n\n- [ ] buy **milk**\n- [x] call [Sam](https://example.com)\n\n1. one\n2. two\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```js\nlet x = 1;\n```\n\n##### Small heading\n\n<script>window.HACKED = 1</script>\n<img src="x" onerror="window.HACKED = 2">\n';
await pg.evaluate((md) => { MFS.put(R, 'Notes in markdown.md', md); MFS.put(R, 'todo list.txt', 'line one\n\nline <two> & more\n'); MFS.put(R, 'Titled.md', '# Own title\n\ntext\n'); }, MD);
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
check('Markdown and text files are no longer greyed', await pg.$eval(row('Notes in markdown.md'), e => e.classList.contains('k-page') && e.textContent === 'Notes in markdown.md') && await pg.$eval(row('todo list.txt'), e => e.classList.contains('k-page')) && await pg.$eval(row('picture.png'), e => e.classList.contains('k-other')));
await clickRow('Notes in markdown.md');
const md = await pg.evaluate(() => { const d = document.querySelector('#doc'), q = s => [...d.querySelectorAll(s)]; return {
  h1: q('h1').map(x => x.textContent), h2: q('h2').map(x => x.textContent), h4: q('h4').map(x => x.textContent),
  checks: q('ul.check > li').map(li => [li.firstChild.nodeName, li.firstChild.checked, li.firstChild.disabled, li.textContent.trim()]), bold: q('ul.check strong, ul.check b').map(x => x.textContent), link: q('ul.check a').map(a => a.getAttribute('href')),
  ol: q('ol > li').map(x => x.textContent.trim()), th: q('table th').map(x => x.textContent), td: q('table td').map(x => x.textContent), pre: q('pre').map(x => x.textContent.trim()),
  script: q('script').length, onerror: q('[onerror]').length, hacked: window.HACKED, text: d.textContent }; });
same('Markdown: front matter is dropped and its title becomes the H1', [md.h1, /pageid|x1/.test(md.text)], [['From front matter'], false]);
same('Markdown: headings convert; levels below H4 become H4', [md.h2, md.h4], [['Tasks'], ['Small heading']]);
same('Markdown: task lists become checklists with working boxes', md.checks, [['INPUT', false, false, 'buy milk'], ['INPUT', true, false, 'call Sam']]);
same('Markdown: bold, links, numbered lists, tables and code convert', [md.bold, md.link, md.ol, md.th, md.td, md.pre], [['milk'], ['https://example.com'], ['one', 'two'], ['A', 'B'], ['1', '2'], ['let x = 1;']]);
same('Markdown: script in the file is removed and never runs', [md.script, md.onerror, md.hacked === undefined], [0, 0, true]);
s = await state();
check('an imported Markdown file is a new unsaved page beside the original', s.cur.node === null && s.cur.dir === '' && /Imported Notes in markdown.md/.test(await msg()));
await setH1('From front matter'); await save();
check('saving it writes an HTML page named from the title and leaves the .md untouched', (await paths()).includes('From front matter.html') && await text('Notes in markdown.md') === MD && /class="check"/.test(await text('From front matter.html')), await paths());
await clickRow('Titled.md');
same('Markdown with its own H1 keeps it', await pg.$$eval('#doc h1', hs => hs.map(h => h.textContent)), ['Own title']);
await clickRow('todo list.txt');
same('plain text: the file name is the title, one paragraph a line, characters kept as typed', await pg.evaluate(() => [document.querySelector('#doc h1').textContent, [...document.querySelectorAll('#doc p')].map(p => p.textContent)]), ['todo list', ['line one', 'line <two> & more']]);

/* ----- New and Open in a notebook; a page outside the notebook ----- */
await setH1('Foreign changed'); await pg.click('#chrome button[data-a="new"]'); await sleep(250);
check('New with unsaved changes uses the same prompt', await dlgOpen('#nb-ask'));
await pg.click('#nb-ask button[value="cancel"]'); await sleep(200);
check('Cancel keeps the page', await h1() === 'Foreign changed');
await pg.click('#chrome button[data-a="new"]'); await sleep(200); await pg.click('#nb-ask button[value="discard"]'); await sleep(300);
check('Discard starts the new page', await h1() === 'Untitled document' && (await state()).cur.node === null);

/* ----- files without the browser's own move (copy, then remove) ----- */
await pg.evaluate(async () => { window.R = MFS.make({ A: { 'One.html': PAGE('One') }, B: {} }, 'NoMove', { noMove: true }); await FLE.NB.openRoot(R, false, true); });
await sleep(200); await clickRow('A');
await renameTo('A/One.html', 'Uno'); await drag('A/Uno.html', 'B');
check('rename and move work by copy where the browser cannot move', (await paths()).includes('B/Uno.html') && !(await paths()).some(p => /One|A\/Uno/.test(p)) && /<h1>One<\/h1>/.test(await text('B/Uno.html')), await paths());

/* ----- read-only mode (browsers without folder access) ----- */
await pg.evaluate(async () => { window.R = MFS.make({ 'Read.html': PAGE('Read me'), 'x.pdf': 'pdf' }, 'Shared'); await FLE.NB.openRoot(R, true, true); });
await sleep(200);
check('read-only is shown in the panel title', await pg.$eval('#nb-name', e => /read-only/.test(e.textContent)));
same('read-only rows offer only Open', await menuItems('Read.html'), ['Open']);
check('read-only rows cannot be dragged, and New folder is hidden', await pg.$eval(row('Read.html'), e => !e.draggable) && await pg.$eval('#nb button[data-nb="newfolder"]', e => e.hidden));
await clickRow('Read.html'); await setH1('Read me changed'); await save();
check('read-only save goes to downloads and does not touch the folder', /downloads folder: Read\.html/.test(await pg.$eval('#savedmsg', e => e.textContent)) && /<h1>Read me<\/h1>/.test(await text('Read.html')));

/* ----- a browser that cannot open a folder for writing ----- */
await pg.evaluate(async () => {
  const f = (path, text) => ({ name: path.split('/').pop(), webkitRelativePath: path, text: async () => text, lastModified: 5 });
  await FLE.NB.openRoot(FLE.NB.listTree([f('Pick/One.html', PAGE('One')), f('Pick/Sub/Two.html', PAGE('Two')), f('Pick/Sub/note.txt', 'n')]), true, true);
});
await sleep(200); await clickRow('Sub');
same('a picked file list is shown as a read-only tree', (await state()).rows, ['Sub', 'Sub/note.txt', 'Sub/Two.html', 'One.html']);
await clickRow('Sub/Two.html');
check('and its pages open', await h1() === 'Two' && (await state()).cur.node === 'Sub/Two.html');
check('no warning where the browser can open folders', await pg.$eval('#nbwarn', e => e.hidden));
await pg.evaluateOnNewDocument(() => { delete Window.prototype.showDirectoryPicker; delete window.showDirectoryPicker; });
await pg.reload(); await sleep(500);
check('a browser without folder access is told Chrome or Edge works best', await pg.$eval('#nbwarn', e => !e.hidden && /Chrome or Edge/.test(e.textContent)));
check('the panel was open last time, so it is open again, with the read-only landing text', await pg.$eval('#nb', e => !e.hidden) && await pg.$eval('#nb-land', e => !e.hidden && /read-only/.test(e.textContent)));
await pg.click('#chrome button[data-a="nbwarnx"]'); await sleep(150);
check('Dismiss hides the notice', await pg.$eval('#nbwarn', e => e.hidden));
await pg.reload(); await sleep(500);
check('and it stays dismissed', await pg.$eval('#nbwarn', e => e.hidden));

check('no page errors', errors.length === 0, errors);
await b.close();
