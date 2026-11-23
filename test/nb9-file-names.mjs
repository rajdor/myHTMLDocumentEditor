// A page keeps its file name: a rename typed with the extension gets no second one; clearing the title keeps the name;
// a page whose file went away, or whose folder could not be read for a moment, is saved under the name it had; only a
// new page with no file is named after its title.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
const { b, pg, errors } = await open();
await pg.evaluate(installMockFs);
const row = (p) => '.nb-row[title="' + p + '"]';
const state = () => pg.evaluate(() => FLE.NB.state);
const paths = () => pg.evaluate(() => MFS.paths(R).filter(p => !p.startsWith('.')));
const text = (p) => pg.evaluate((p) => MFS.text(R, p), p);
const msg = () => pg.evaluate(() => document.querySelector('#nb-msg').textContent);
const setH1 = async (t) => { await pg.evaluate((t) => { const h = document.querySelector('#doc h1'); h.textContent = t; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }, t); await sleep(50); };
const edit = async (t) => { await pg.evaluate((t) => { document.querySelector('#doc p').textContent = t; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }, t); await sleep(50); };
const clickRow = async (p) => { await pg.click(row(p)); await sleep(250); };
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(400); };
const menu = async (p, item) => { await pg.click(row(p), { button: 'right' }); await sleep(100); await pg.evaluate((item) => { const b = [...document.querySelectorAll('#nb-menu button')].find(x => x.textContent === item); b.click(); }, item); await sleep(300); };
const renameTo = async (p, name) => { await menu(p, 'Rename'); await pg.evaluate((n) => { document.querySelector('#nb-tree input').value = n; }, name); await pg.focus('#nb-tree input'); await pg.keyboard.press('Enter'); await sleep(350); };
await pg.evaluate(async () => {
  FLE.load('<main><h1>TITLE</h1><p>TITLE text</p></main>'); const tpl = FLE.build(); window.PAGE = (t) => tpl.replace(/TITLE/g, t);
  window.R = MFS.make({ 'Plan.html': PAGE('The plan'), 'Notes.html': PAGE('Notes'), Sub: { 'Deep.html': PAGE('Deep') }, 'hand made.html': '<html><body><h1>Hand made</h1><p>text</p></body></html>', '.trash': {} }, 'Names');
  FLE.NB.toggle(true); await FLE.NB.openRoot(R, false, true);
});
await sleep(200);

/* ----- rename ----- */
await renameTo('Plan.html', 'Plan 2026.html');
same('a rename typed with .html gets no second extension', await paths(), ['Notes.html', 'Plan 2026.html', 'Sub/', 'Sub/Deep.html', 'hand made.html']);
await renameTo('Plan 2026.html', 'Plan final');
check('a rename typed without it still gets .html', (await paths()).includes('Plan final.html'));
await renameTo('Plan final.html', 'Plan final.HTM');
check('an extension in other letters is taken as given', (await paths()).includes('Plan final.HTM'), await paths());

/* ----- clearing the title ----- */
await clickRow('Notes.html'); await setH1(''); await save();
same('clearing the title keeps the file name: no Untitled file', await paths(), ['Notes.html', 'Plan final.HTM', 'Sub/', 'Sub/Deep.html', 'hand made.html']);
await setH1('A completely new title'); await save();
check('a new title does not rename the file or make a new one', (await paths()).filter(p => /new title/.test(p)).length === 0 && /A completely new title/.test(await text('Notes.html')));

/* ----- a page whose file went away ----- */
await pg.evaluate(() => MFS.drop(R, 'Notes.html')); await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
check('a page removed outside the editor is kept as an unsaved page', (await state()).cur.node === null && /outside the editor/.test(await msg()));
await save();
check('Save writes it back under the name it had, not after its title', (await paths()).includes('Notes.html') && !(await paths()).some(p => /new title/.test(p)), await paths());

/* ----- a folder that could not be read for a moment ----- */
await pg.click(row('Sub')); await sleep(200); await clickRow('Sub/Deep.html');
await pg.evaluate(() => { const d = R.kids.get('Sub'); d._values = d.values; d.values = async function* () { throw new DOMException('busy', 'NotReadableError'); }; });
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
check('the open page stays tied to its file', (await state()).cur.node === 'Sub/Deep.html', await state());
await pg.evaluate(() => { const d = R.kids.get('Sub'); d.values = d._values; });
await edit('deep edit'); await save();
check('and saves into it', /deep edit/.test(await text('Sub/Deep.html')) && (await paths()).filter(p => /Deep/.test(p)).length === 1, await paths());

/* ----- a new page is still named after its title ----- */
await pg.click('#chrome button[data-a="new"]'); await sleep(300);
await setH1('Brand new'); await save();
check('a new page with no file is named after its title', (await paths()).includes('Sub/Brand new.html'), await paths());
same('no page errors', errors, []);
await b.close();
