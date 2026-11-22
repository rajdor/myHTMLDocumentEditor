// Notebook history: copies on a timer only when the page changed, the replaced version kept on save, no duplicates,
// Page history and Restore, recovery of unsaved work, history following rename and move, the status line and its
// thresholds, and the clean-up dialog for history and trash.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';

const { b, pg, errors, dialogs } = await open();
await pg.evaluate(installMockFs);
const row = (p) => '.nb-row[title="' + p + '"]';
const state = () => pg.evaluate(() => FLE.NB.state);
const paths = () => pg.evaluate(() => MFS.paths(R));
const hist = async (under = '') => (await paths()).filter(p => p.startsWith('.history/' + under) && p.endsWith('.html'));
const text = (p) => pg.evaluate((p) => MFS.text(R, p), p);
const h1 = () => pg.evaluate(() => document.querySelector('#doc h1').textContent);
const msg = () => pg.evaluate(() => document.querySelector('#nb-msg').textContent);
const dirty = () => pg.evaluate(() => document.querySelector('[data-a="save"]').classList.contains('has'));
const setH1 = async (t) => { await pg.evaluate((t) => { const h = document.querySelector('#doc h1'); h.textContent = t; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }, t); await sleep(50); };
const clickRow = async (p) => { await pg.click(row(p)); await sleep(300); };
const menu = async (p, item) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const ok = await pg.evaluate((item) => { const b = [...document.querySelectorAll('#nb-menu button')].find(x => x.textContent === item); if (b) b.click(); return !!b; }, item); await sleep(350); return ok; };
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(400); };
const snap = () => pg.evaluate(() => FLE.NB.snapshot());
const status = async () => { await pg.evaluate(() => FLE.NB.measure()); return pg.evaluate(() => { const s = document.querySelector('#nb-status'); return { hidden: s.hidden, cls: s.className, text: s.textContent }; }); };
const renameTo = async (p, name) => { await menu(p, 'Rename'); await pg.evaluate((n) => { document.querySelector('#nb-tree input').value = n; }, name); await pg.focus('#nb-tree input'); await pg.keyboard.press('Enter'); await sleep(400); };
const drag = async (from, to) => { await pg.evaluate((a, b) => { const s = document.querySelector(a), d = document.querySelector(b), dt = new DataTransfer(); s.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt })); d.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt })); }, row(from), to === '' ? '#nb-tree' : row(to)); await sleep(400); };
const reopen = async () => { await pg.evaluate(async () => { FLE.load('<main><h1>Untitled document</h1><p>Start writing.</p></main>'); await FLE.NB.openRoot(R, false, true); }); await sleep(250); };

await pg.evaluate(async () => {
  FLE.load('<main><h1>TITLE</h1><p>TITLE text</p></main>'); const tpl = FLE.build();
  window.PAGE = (t) => tpl.replace(/TITLE/g, t);
  window.R = MFS.make({ Work: { 'Alpha.html': PAGE('Alpha') }, 'Beta.html': PAGE('Beta'), '.trash': {} }, 'Hist');
  FLE.load('<main><h1>Untitled document</h1><p>Start writing.</p></main>');
  FLE.NB.toggle(true); await FLE.NB.openRoot(R, false, true);
});
await sleep(250);

/* ----- the status line ----- */
let st = await status();
check('the status line at the foot of the explorer shows the size of history', !st.hidden && st.cls === 'is-ok' && /^History 0 KB$/.test(st.text), st);

/* ----- copies on a timer: only when the page has changed ----- */
await clickRow('Work'); await clickRow('Work/Alpha.html');
check('a page left open and untouched writes no copy', await snap() === false && (await hist()).length === 0);
await pg.evaluate(() => document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true }))); await sleep(50);
check('a page marked as changed whose content is the same as on disk writes no copy', await dirty() && await snap() === false && (await hist()).length === 0);
await setH1('Alpha one');
check('a changed page writes a copy of the unsaved work', await snap() === true);
let h = await hist('Work/Alpha.html/');
check('the copy is in .history under the page path, named by date and time and marked unsaved', h.length === 1 && /^\.history\/Work\/Alpha\.html\/\d{4}-\d\d-\d\d \d\d\.\d\d\.\d\d unsaved\.html$/.test(h[0]), h);
check('the copy is a complete page holding the unsaved work', /<meta name="generator" content="fine-line-editor \d+\.\d+\.\d+">/.test(await text(h[0])) && /<h1>Alpha one<\/h1>/.test(await text(h[0])));
check('the file itself is untouched', /<h1>Alpha<\/h1>/.test(await text('Work/Alpha.html')));
check('no second copy while nothing more has changed', await snap() === false && (await hist()).length === 1);
await setH1('Alpha two');
check('a further change writes a further copy', await snap() === true && (await hist()).length === 2);
st = await status();
check('the status line counts the copies', /^History \d+ KB$/.test(st.text) && !/^History 0 KB/.test(st.text), st);

/* ----- on save: the version being replaced is kept ----- */
await save();
h = await hist('Work/Alpha.html/');
const saved = h.filter(p => !/unsaved/.test(p));
check('saving keeps the version it replaced, as a saved version', h.length === 3 && saved.length === 1 && /<h1>Alpha<\/h1>/.test(await text(saved[0])), h);
check('and the file now holds the new version', /<h1>Alpha two<\/h1>/.test(await text('Work/Alpha.html')));
await setH1('Alpha two'); await save();
check('saving with nothing changed keeps no copy', (await hist()).length === 3);
await setH1('Alpha three'); await save();
check('a replaced version that history already holds (as unsaved work) is not kept twice', (await hist()).length === 3, await hist());
await setH1('Alpha four'); await save();
check('each later save keeps the version before it', (await hist()).length === 4 && (await Promise.all((await hist()).map(text))).some(t => /<h1>Alpha three<\/h1>/.test(t)));

/* ----- Page history and Restore ----- */
check('a page offers Page history on right-click', await menu('Work/Alpha.html', 'Page history'));
const list = await pg.evaluate(() => ({ open: document.querySelector('#nb-hist').open, title: document.querySelector('#nb-hist-h').textContent, rows: [...document.querySelectorAll('#nb-hist-list .nb-li')].map(r => [...r.querySelectorAll('span')].map(s => s.textContent)) }));
check('the dialog lists the copies, newest first, with kind and size', list.open && list.title === 'History: Alpha.html' && list.rows.length === 4 && list.rows.every(r => /^(Saved version|Unsaved changes)$/.test(r[1]) && /KB$/.test(r[2])), list);
same('saved versions and unsaved work are told apart', list.rows.map(r => r[1]).sort(), ['Saved version', 'Saved version', 'Unsaved changes', 'Unsaved changes']);
const before = await text('Work/Alpha.html');
await pg.evaluate(() => { const rows = [...document.querySelectorAll('#nb-hist-list .nb-li')]; rows[rows.length - 1].querySelector('button').click(); }); await sleep(400);
check('Restore puts the copy in the editor as unsaved changes', await h1() === 'Alpha' && await dirty() && (await state()).cur.node === 'Work/Alpha.html' && /Restored the copy/.test(await msg()));
check('nothing on disk changes until Save', await text('Work/Alpha.html') === before);
await save();
check('Save writes the restored version, and the version it replaced is in history', /<h1>Alpha<\/h1>/.test(await text('Work/Alpha.html')) && (await Promise.all((await hist()).map(text))).some(t => /<h1>Alpha four<\/h1>/.test(t)));
await menu('Beta.html', 'Page history');
check('a page with no copies says so', await pg.$eval('#nb-hist-t', e => /^No copies yet/.test(e.textContent)) && await pg.$eval('#nb-hist-list', e => e.children.length === 0));
await pg.click('#nb-hist button[value="cancel"]'); await sleep(150);

/* ----- recovery of unsaved work ----- */
await clickRow('Beta.html'); await setH1('Beta not saved'); await snap();
await reopen();   // as if the editor had closed: the unsaved work is only in history
check('nothing is offered until the page is opened', await pg.$eval('#nb-rec', e => e.hidden));
await clickRow('Beta.html');
check('opening a page with newer unsaved work in history offers to recover it', await h1() === 'Beta' && await pg.$eval('#nb-rec', e => !e.hidden && /Unsaved changes to this page/.test(e.textContent)));
await pg.click('#nb button[data-nb="recover"]'); await sleep(400);
check('Recover brings the unsaved work back as unsaved changes', await h1() === 'Beta not saved' && await dirty() && await pg.$eval('#nb-rec', e => e.hidden) && /<h1>Beta<\/h1>/.test(await text('Beta.html')));
await save(); await reopen(); await clickRow('Beta.html');
check('once saved, nothing is offered', await h1() === 'Beta not saved' && await pg.$eval('#nb-rec', e => e.hidden));
await setH1('Beta again'); await snap(); await reopen(); await clickRow('Beta.html');
await pg.click('#nb button[data-nb="norecover"]'); await sleep(150);
check('Dismiss leaves the page as saved', await h1() === 'Beta not saved' && !(await dirty()) && await pg.$eval('#nb-rec', e => e.hidden));

/* ----- history follows a page that is renamed or moved in the editor ----- */
await clickRow('Work');
const nA = (await hist('Work/Alpha.html/')).length;
await renameTo('Work/Alpha.html', 'Gamma');
check('renaming a page moves its history', (await hist('Work/Gamma.html/')).length === nA && (await hist('Work/Alpha.html/')).length === 0, await hist());
await renameTo('Work', 'Jobs');
check('renaming a folder moves the history of the pages in it', (await hist('Jobs/Gamma.html/')).length === nA && (await hist('Work/')).length === 0, await hist());
await drag('Jobs/Gamma.html', '');
check('moving a page moves its history', (await hist('Gamma.html/')).length === nA && (await hist('Jobs/')).length === 0, await hist());
await menu('Gamma.html', 'Page history');
check('and Page history still finds it', await pg.$eval('#nb-hist-list', e => e.children.length) === nA);
await pg.click('#nb-hist button[value="cancel"]'); await sleep(150);

/* ----- the status line thresholds ----- */
await pg.evaluate(() => MFS.put(R, '.notebook/settings.json', JSON.stringify({ showHidden: true, historyNoteMB: 0.001, historyWarnMB: 500 })));
await reopen(); st = await status();
check('over the note threshold the status line says so', st.cls === 'is-note', st);
await pg.evaluate(() => MFS.put(R, '.notebook/settings.json', JSON.stringify({ showHidden: true, historyNoteMB: 0.001, historyWarnMB: 0.002 })));
await reopen(); st = await status();
check('over the warning threshold it warns', st.cls === 'is-warn' && await pg.$eval('#nb-status', e => /over 0\.002 MB/.test(e.title)), st);
await pg.evaluate(() => MFS.put(R, '.notebook/settings.json', '{ not json'));
await reopen(); st = await status();
check('damaged settings fall back to the defaults', st.cls === 'is-ok', st);

/* ----- clean-up ----- */
await pg.evaluate(() => { for (const d of ['2020-01-01 10.00.00', '2020-01-02 10.00.00 unsaved', '2020-01-03 10.00.00']) MFS.put(R, '.history/Beta.html/' + d + '.html', PAGE('old ' + d)); const d = new Date(), p2 = n => String(n).padStart(2, '0'); MFS.put(R, '.history/Gone/Lost.html/' + d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' 00.00.01.html', PAGE('lost')); MFS.put(R, '.trash/Old.html', PAGE('old')); });
await clickRow('Jobs'); await menu('Gamma.html', 'Move to trash');
const nBeta = (await hist('Beta.html/')).length;
await pg.click('#nb-status'); await sleep(500);
const cl = await pg.evaluate(() => ({ open: document.querySelector('#nb-clean').open, sum: document.querySelector('#nb-clean-t').textContent, rows: [...document.querySelectorAll('#nb-clean-list .nb-li')].map(r => r.firstChild.textContent), orph: document.querySelector('#nb-orph-t').textContent, trash: document.querySelector('#nb-trash-t').textContent }));
check('the status line opens the clean-up dialog with totals for history and trash', cl.open && /^History: \d+ copies of 3 pages, [\d.]+ (KB|MB)\. Trash: 2 files, /.test(cl.sum), cl);
check('history is listed by page', cl.rows.length === 3 && cl.rows.some(r => r === 'Beta.html') && cl.rows.some(r => r === 'Gamma.html'), cl.rows);
check('a page in the trash still counts as existing; a page that is gone is marked', cl.rows.includes('Gone/Lost.html (page no longer exists)') && /: 1 page, /.test(cl.orph), cl);
let n0 = dialogs.length;
await pg.click('#nb-clean button[value="days"]'); await sleep(500);
check('Delete older than asks first, saying how many and how much', dialogs.length === n0 + 1 && /^Delete 3 history copies older than 90 days \(/.test(dialogs[n0]) && /cannot be undone/.test(dialogs[n0]), dialogs[n0]);
check('and removes only the old copies', (await hist('Beta.html/')).length === nBeta - 3 && !(await hist()).some(p => /2020-/.test(p)) && await pg.$eval('#nb-clean-e', e => /^Deleted 3 copies/.test(e.textContent)));
await pg.$eval('#nb-keep', e => { e.value = '1'; }); n0 = dialogs.length;
await pg.click('#nb-clean button[value="keep"]'); await sleep(500);
check('Keep only the newest leaves that many of each page', (await hist('Beta.html/')).length === 1 && (await hist('Gamma.html/')).length === 1 && (await hist('Gone/Lost.html/')).length === 1 && /beyond the newest 1 of each page/.test(dialogs[n0]), await hist());
await pg.click('#nb-clean button[value="keep"]'); await sleep(400);
check('when there is nothing to delete it says so and does not ask', dialogs.length === n0 + 1 && await pg.$eval('#nb-clean-e', e => /^Nothing to delete/.test(e.textContent)));
await pg.click('#nb-clean button[value="orphans"]'); await sleep(500);
check('history of pages that no longer exist can be deleted, and empty folders go with it', (await hist('Gone/')).length === 0 && !(await paths()).some(p => p.startsWith('.history/Gone')) && (await hist('Gamma.html/')).length === 1, await paths());
await pg.click('#nb-clean button[value="trash"]'); await sleep(500);
check('Empty trash from the dialog asks, then clears the trash', (await paths()).filter(p => p.startsWith('.trash')).join() === '.trash/' && /Delete everything in the trash/.test(dialogs[dialogs.length - 1]));
const after = await pg.evaluate(() => ({ open: document.querySelector('#nb-clean').open, orph: document.querySelector('#nb-orph-t').textContent, trash: document.querySelector('#nb-trash-t').textContent }));
check('the dialog stays open and shows the new totals; the page deleted from the trash is now gone', after.open && /^Trash: 0 files, 0 KB$/.test(after.trash) && /: 1 page, /.test(after.orph), after);
await pg.click('#nb-clean button[value="cancel"]'); await sleep(200);
st = await status();
check('the status line follows', /^History \d+ KB$/.test(st.text), st);

/* ----- read-only mode keeps no history ----- */
await pg.evaluate(async () => { window.R = MFS.make({ 'Read.html': PAGE('Read') }, 'Shared'); FLE.load('<main><h1>Untitled document</h1></main>'); await FLE.NB.openRoot(R, true, true); });
await sleep(200); await clickRow('Read.html'); await setH1('Read changed');
check('read-only: no copies, no status line, no Page history', await snap() === false && (await paths()).join() === 'Read.html' && await pg.$eval('#nb-status', e => e.hidden));

check('no page errors', errors.length === 0, errors);
await b.close();
