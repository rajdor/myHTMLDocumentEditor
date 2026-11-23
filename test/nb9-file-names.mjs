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

/* ----- a folder where the browser refuses its own move (as OneDrive on a Mac can): copy, then remove ----- */
await pg.evaluate(() => { window.__no = async function () { const e = new Error('The request is not allowed by the user agent or the platform in the current context.'); e.name = 'NotAllowedError'; throw e; }; const F = Object.getPrototypeOf([...R.kids.values()].find(k => k.kind === 'file')); window.__mv = F._move; F._move = window.__no; for (const k of R.kids.values()) if (k.kind === 'file') k.move = window.__no; });
await renameTo('Plan final.HTM', 'Plan moved.HTM');
same('when the browser refuses to move a file, it is renamed by copying it, with no message', [(await paths()).filter(p => /^Plan/.test(p)), await msg()], [['Plan moved.HTM'], '']);
check('and the copy has the text', /The plan/.test(await text('Plan moved.HTM')));
await pg.evaluate(() => { for (const k of R.kids.values()) if (k.kind === 'file') k.move = window.__no; });
await pg.evaluate(() => { const D = Object.getPrototypeOf(R); window.__rm = D.removeEntry; D.removeEntry = async function (n, o) { if (n === 'Plan moved.HTM') { const e = new Error('busy'); e.name = 'NoModificationAllowedError'; throw e; } return window.__rm.call(this, n, o); }; });
await renameTo('Plan moved.HTM', 'Plan again.HTM');
same('when the old file cannot be removed either, the copy is taken away again, so there are never two', (await paths()).filter(p => /^Plan/.test(p)), ['Plan moved.HTM']);
check('and the message says why', /Could not rename: the file is in use or being synced/.test(await msg()), await msg());
check('the message has a Dismiss button', await pg.evaluate(() => !!document.querySelector('#nb-msg button[aria-label="Dismiss"]')));
await pg.click('#nb-msg button[aria-label="Dismiss"]'); await sleep(50);
same('which closes it', await pg.evaluate(() => [document.querySelector('#nb-msg').textContent, getComputedStyle(document.querySelector('#nb-msg')).display]), ['', 'none']);
await pg.evaluate(() => { Object.getPrototypeOf(R).removeEntry = window.__rm; Object.getPrototypeOf([...R.kids.values()].find(k => k.kind === 'file'))._move = window.__mv; for (const k of R.kids.values()) if (k.kind === 'file') k.move = window.__mv; });
await renameTo('Plan moved.HTM', 'Plan final.HTM');

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

/* ----- the open page renamed outside the editor: it follows the new name; nothing comes back under the old one ----- */
await clickRow('Notes.html'); await sleep(100);
await pg.evaluate(() => { const k = R.kids.get('Notes.html'); R.kids.delete('Notes.html'); k.name = 'Notes renamed.html'; R.kids.set(k.name, k); });
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
{ const s = await state(); check('the open page follows a rename made outside the editor', s.cur.node === 'Notes renamed.html', s.cur); }
check('and says so', /renamed outside the editor to "Notes renamed.html"/.test(await msg()), await msg());
await edit('Edited after the rename'); await save();
same('Save writes the new name and does not bring the old file back', (await paths()).filter(p => /^Notes/.test(p)), ['Notes renamed.html']);
check('with the edit in it', /Edited after the rename/.test(await text('Notes renamed.html')));
await renameTo('Notes renamed.html', 'Notes.html');

await clickRow('Notes.html'); await sleep(100);
await pg.evaluate(() => { const k = R.kids.get('Notes.html'); MFS.put(R, 'Notes quick.html', k.text); MFS.age(R, 'Notes quick.html', k.mtime); MFS.drop(R, 'Notes.html'); });
await edit('Saved before the panel looked again'); await save();
same('Save straight after a rename outside, before the panel has looked again, also follows it', [(await paths()).filter(p => /^Notes/.test(p)), /Saved before/.test(await text('Notes quick.html'))], [['Notes quick.html'], true]);
await renameTo('Notes quick.html', 'Notes.html');

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
await clickRow('Notes.html'); await sleep(100);
await pg.evaluate(() => { const k = R.kids.get('Notes.html'); R.kids.delete('Notes.html'); k.name = 'Notes b.html'; R.kids.set(k.name, k); MFS.put(R, 'Notes c.html', k.text); MFS.age(R, 'Notes c.html', k.mtime); });
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
check('when two files could be the renamed one, it is not guessed: the page is kept as an unsaved page', (await state()).cur.node === null && /moved, renamed or deleted/.test(await msg()), await msg());
same('no page errors', errors, []);
await b.close();
