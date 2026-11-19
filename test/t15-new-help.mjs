// New asks before discarding unsaved changes, whether the document was opened or started new; Help is a dialog at the
// far right of the toolbar and holds the editor version and the document name.
import { open, check, same, caretIn, click, sleep, load, idxTo } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard;
// answer confirm() in the page, and record what it asked
await pg.evaluate(() => { window.__asked = []; window.__answer = false; window.confirm = m => { window.__asked.push(m); return window.__answer; }; });
const asked = () => pg.evaluate(() => { const a = window.__asked; window.__asked = []; return a; });
const answer = (v) => pg.evaluate(v => { window.__answer = v; }, v);
const text = () => pg.evaluate(() => document.getElementById('doc').textContent);
const STARTER = 'Untitled documentSubtitleSectionStart writing.';

await click(pg, 'new'); await sleep(50);
same('New on an untouched new document does not ask', await asked(), []);
await caretIn(pg, '#doc p:last-child'); await K.type(' More'); await sleep(50);
await click(pg, 'new'); await sleep(50);
let a = await asked();
check('New on a changed new document asks first, and says to save', a.length === 1 && /unsaved changes/.test(a[0]) && /Save it first/.test(a[0]), a);
check('Cancel keeps the document', (await text()).endsWith('Start writing. More'), await text());
await answer(true); await click(pg, 'new'); await sleep(50);
check('OK starts a new document', (await asked()).length === 1 && (await text()) === STARTER, await text());
await click(pg, 'new'); await sleep(50);
same('the fresh document is clean again', await asked(), []);
// a second new document that is then changed
await answer(false); await caretIn(pg, '#doc h1'); await K.type('!'); await sleep(50); await click(pg, 'new'); await sleep(50);
check('a later new document that has changed asks too', (await asked()).length === 1 && (await text()).startsWith('Untitled document!'));
// changes that are not typing
for (const [name, act] of [['a toolbar change (bold)', async () => { await pg.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#doc p:last-child')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await click(pg, 'bold'); }], ['an index level change', async () => { await idxTo(pg, '2'); }], ['the notes margin button', async () => { await click(pg, 'margin'); }], ['a paste', async () => { await caretIn(pg, '#doc p:last-child'); await pg.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'x'); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }); }]]) {
  await answer(true); await click(pg, 'new'); await sleep(50); await asked(); await click(pg, 'new'); await sleep(50);
  const clean = (await asked()).length === 0;
  await answer(false); await act(); await sleep(50); await click(pg, 'new'); await sleep(50);
  check('New asks after ' + name, clean && (await asked()).length === 1);
}
// an opened document
await answer(true); await click(pg, 'new'); await sleep(50); await asked();
await load(pg, '<main><h1>Opened</h1><p id="p">Text</p></main>', 'opened.html'); await click(pg, 'new'); await sleep(50);
check('New on an opened, unchanged document does not ask', (await asked()).length === 0 && (await text()) === STARTER);
await load(pg, '<main><h1>Opened</h1><p id="p">Text</p></main>', 'opened.html'); await answer(false); await caretIn(pg, '#doc p'); await K.type('!'); await sleep(50); await click(pg, 'new'); await sleep(50);
check('New on an opened, changed document asks', (await asked()).length === 1 && (await text()) === 'OpenedText!');

// Help
same('Help is the last button in the toolbar', await pg.evaluate(() => { const k = [...document.querySelectorAll('#tbar button')]; return k[k.length - 1].dataset.a; }), 'help');
check('Help sits at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return t.right - h.right < 20 && h.top - t.top < 20; }));
check('the toolbar no longer shows the version or the document name', !/notebook v|opened\.html/.test(await pg.$eval('#tbar', t => t.textContent)), await pg.$eval('#status', t => t.textContent));
same('unsaved changes show as a dot on Save, so the toolbar does not change height', await pg.evaluate(() => { const s = document.querySelector('[data-a="save"]'); return [s.classList.contains('has'), s.title, document.getElementById('status').textContent]; }), [true, 'Save (Ctrl+S): unsaved changes', '']);
const before = await pg.evaluate(() => document.querySelector('.page').getBoundingClientRect().top);
await click(pg, 'help'); await sleep(100);
const dlg = await pg.evaluate(() => { const d = document.getElementById('help'); return { open: d.open, modal: d.matches(':modal'), info: document.getElementById('help-info').textContent, topics: [...d.querySelectorAll('.help-body .hc .hc-h span')].map(x => x.textContent), cols: new Set([...d.querySelectorAll('.hc')].map(c => Math.round(c.getBoundingClientRect().left))).size, fits: [...d.querySelectorAll('.hc')].every(c => c.querySelectorAll('li').length >= 2) }; });
check('Help opens as a dialog box', dlg.open && dlg.modal, dlg);
check('the dialog shows the editor version and the document name', /^Fine Line notebook v\d+\.\d+\.\d+ \| Document: opened\.html \(unsaved changes\)$/.test(dlg.info), dlg.info);
same('the dialog holds the help topics as cards', dlg.topics, ['Writing and styles', 'Index', 'Copy, cut and paste', 'Tables', 'Links', 'Notes', 'Code', 'Q&A', 'Diagrams', 'Connectors', 'Notebook', 'Files']);
check('cards are laid out in columns of short points', dlg.cols >= 2 && dlg.fits, dlg);
same('opening Help does not move the page', await pg.evaluate(() => document.querySelector('.page').getBoundingClientRect().top), before);
await pg.screenshot({ path: 'test/out/t15-help.png' });
await K.press('Escape'); await sleep(50);
check('Escape closes it', await pg.evaluate(() => !document.getElementById('help').open));
await click(pg, 'help'); await sleep(50); await pg.click('#help [data-a="helpclose"]'); await sleep(50);
check('the close button closes it', await pg.evaluate(() => !document.getElementById('help').open));
same('no page errors', errors, []);
await b.close();

// the cursor stays in the document after a toolbar list is used: arrow keys move the cursor, not the list
const t3 = await open();
await load(t3.pg, '<main><h1>T</h1><h2>A</h2><p id="a">one</p><p id="p">para</p><p id="z">last</p></main>');
const at = () => t3.pg.evaluate(() => { let n = getSelection().anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; return [document.activeElement.id, n && n.closest('#doc > *').textContent, document.getElementById('s-index').value, document.getElementById('s-block').value]; });
await t3.pg.click('#p'); await t3.pg.click('#s-index'); await sleep(200);
same('after stepping the index level the cursor is still in the text', await at(), ['doc', 'para', '2', 'p']);
same('the button shows the level and its tooltip says what it does', await t3.pg.$eval('#s-index', x => [x.querySelector('em').textContent, x.title]), ['2', 'Show Index Levels']);
await t3.pg.keyboard.press('ArrowUp'); await sleep(100);
same('Up then moves the cursor up a line and leaves the index level alone', await at(), ['doc', 'one', '2', 'p']);
await t3.pg.click('#p'); await t3.pg.click('#s-block'); await sleep(200); await t3.pg.keyboard.press('Escape'); await sleep(300);
same('closing the Style list without choosing also returns to the text', await at(), ['doc', 'para', '2', 'p']);
await t3.pg.keyboard.press('ArrowUp'); await t3.pg.keyboard.press('ArrowUp'); await sleep(100);
same('and Up moves the cursor, not the style', [(await at())[1], await t3.pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(n => n.tagName).join(','))], ['A', 'H1,H2,P,P,P']);
await t3.pg.click('#p'); await t3.pg.click('#s-block'); await sleep(200); await t3.pg.keyboard.press('ArrowDown'); await t3.pg.keyboard.press('Enter'); await sleep(300);
same('choosing a style still applies it, with the cursor in the text', [(await at())[0], await t3.pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(n => n.tagName).join(','))], ['doc', 'H1,H2,P,H1,P']);
await t3.pg.focus('#s-index'); await t3.pg.keyboard.press('Enter'); await sleep(100); await t3.pg.keyboard.press('Enter'); await sleep(100);
same('Show Index Levels works from the keyboard and steps 2, 3, then back to 1', [(await at())[0], (await at())[2]], ['s-index', '1']);
await t3.pg.focus('#s-boxtype'); await sleep(300); await t3.pg.keyboard.press('ArrowDown'); await sleep(150);
same('a list reached without opening it still works from the keyboard, and the cursor goes into the new box', [(await at())[0], await t3.pg.evaluate(() => document.querySelectorAll('#doc .box.box-note').length)], ['doc', 1]);
same('no page errors (lists)', t3.errors, []);
await t3.b.close();

// the initials button: plain until initials are given, inverted once they are; clicking again changes them
const t2 = await open({ prompt: 'ab' });
const who = () => t2.pg.evaluate(() => { const w = document.getElementById('who'), c = getComputedStyle(w); return [w.classList.contains('on'), c.backgroundColor, c.color, localStorage.getItem('fle-initials')]; });
await t2.pg.evaluate(() => localStorage.removeItem('fle-initials')); await t2.pg.reload(); await sleep(400);
same('with no initials the button is plain', (await who())[0], false);
await t2.pg.click('#who'); await sleep(100);
same('once initials are given the button is inverted', await who(), [true, 'rgb(18, 53, 91)', 'rgb(255, 255, 255)', 'AB']);
await t2.pg.click('#who'); await sleep(100);
check('clicking it again asks for the initials again, showing the current ones', t2.dialogs.length === 2 && t2.dialogs.every(d => /Your initials/.test(d)), t2.dialogs);
await t2.pg.reload(); await sleep(400);
same('the button stays inverted when the editor is opened again', (await who())[0], true);
same('no page errors (initials)', t2.errors, []);
await t2.b.close();
