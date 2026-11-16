// Repeat last toolbar command: Option+Q (Alt+Q on Windows), Option or Alt + click or drag, or the Repeat button applies
// the last toolbar command again at the cursor or on the selection. It sets and never toggles, and is kept until another
// repeatable command replaces it.
import { open, check, same, caretIn, caretCell, click, shape, sleep, load } from './harness.mjs';
const { b, pg, errors, dialogs } = await open({ prompt: 'ab' });
const K = pg.keyboard;
const DOC = '<main><h1>T</h1><p id="a">Alpha beta</p><p id="b">Bravo <b>bold</b> text</p><p id="c">Charlie</p><p id="d">Delta</p><div class="tw"><table><thead><tr><th>H</th><th>I</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table></div><p id="l"><a href="https://example.com/">link text</a> after</p></main>';
const tags = () => pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(n => n.tagName + (n.className ? '.' + n.className : '')).join(','));
const html = s => pg.evaluate(s => { const e = document.querySelector(s); return e ? e.innerHTML : null; }, s);
const pickAll = s => pg.evaluate(s => { const r = document.createRange(); r.selectNodeContents(document.querySelector(s)); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }, s);
const altQ = async () => { await K.down('Alt'); await K.press('KeyQ'); await K.up('Alt'); await sleep(60); };
const btn = () => pg.evaluate(() => { const x = document.querySelector('[data-a="repeat"]'); return [x.classList.contains('dim'), x.title]; });
// Alt + click at the start of an element, as the mouse would do it
const altClick = async (s) => { await pg.evaluate(s => { const e = document.querySelector(s); const r = document.createRange(); r.selectNodeContents(e); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); e.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, altKey: true, button: 0 })); }, s); await sleep(80); };

await load(pg, DOC);
same('with nothing to repeat the button is dimmed', (await btn())[0], true);
await caretIn(pg, '#a'); await altQ(); same('and the key does nothing', await tags(), 'H1,P,P,P,P,DIV.tw,P');
check('the button is beside Redo', await pg.evaluate(() => document.querySelector('[data-a="redo"]').nextElementSibling.dataset.a === 'repeat'));

// a Style list choice
await caretIn(pg, '#a'); await pg.select('#s-block', 'h3'); await sleep(60);
check('the button names the command and the key', !(await btn())[0] && /^Repeat last toolbar command: H3 \((Alt|Option)\+Q, or (Alt|Option) \+ click\)$/.test((await btn())[1]), (await btn())[1]);
await caretIn(pg, '#c'); await altQ();
same('the key repeats the style at the cursor', await tags(), 'H1,H3,P,H3,P,DIV.tw,P');
await caretIn(pg, '#d'); await K.type(' more'); await sleep(50); await caretIn(pg, '#b'); await click(pg, 'repeat'); await sleep(60);
same('the command survives typing, and the button repeats it', await tags(), 'H1,H3,H3,H3,P,DIV.tw,P');
await altClick('#d');
same('Alt + click repeats where you click', await tags(), 'H1,H3,H3,H3,H3,DIV.tw,P');
await K.down('Control'); await K.press('z'); await K.up('Control'); await sleep(100);
same('one undo takes back one repeat', await tags(), 'H1,H3,H3,H3,P,DIV.tw,P');
await pg.evaluate(() => { const e = document.querySelector('#d'); const r = document.createRange(); r.selectNodeContents(e); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); e.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 })); }); await sleep(80);
same('a plain click does not repeat', await tags(), 'H1,H3,H3,H3,P,DIV.tw,P');

// bold: sets, never toggles
await load(pg, DOC); await pickAll('#a'); await click(pg, 'bold'); await sleep(50);
same('Bold is remembered', (await btn())[1].split(': ')[1].split(' (')[0], 'Bold');
await pickAll('#b'); await altQ(); same('repeat makes a partly bold selection all bold', await html('#b'), '<b>Bravo bold text</b>');
await pickAll('#b'); await altQ(); same('repeating on bold text leaves it bold', await html('#b'), '<b>Bravo bold text</b>');
await pickAll('#c'); await K.down('Control'); await K.press('i'); await K.up('Control'); await sleep(80);
same('Ctrl+I counts as the Italic command', (await btn())[1].split(': ')[1].split(' (')[0], 'Italic');
await pickAll('#d'); await altQ(); same('and repeats', await html('#d'), '<i>Delta</i>');

// lists, clear format, ID tag
await load(pg, DOC); await caretIn(pg, '#a'); await click(pg, 'ul'); await sleep(50); await caretIn(pg, '#c'); await altQ(); await caretIn(pg, '#doc ul:last-of-type li'); await altQ();
same('a bulleted list repeats, and stays a list when repeated on a list', await pg.evaluate(() => [document.querySelectorAll('#doc ul').length, document.querySelectorAll('#doc ul li').length]), [2, 2]);
await load(pg, DOC); await caretIn(pg, '#a'); await click(pg, 'clear'); await sleep(50); await caretIn(pg, '#b'); await altQ();
same('Clear format repeats', await html('#doc > p:nth-of-type(2)'), 'Bravo bold text');
await load(pg, DOC); await pg.evaluate(() => { const t = document.querySelector('#a').firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 5); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await click(pg, 'tag'); await sleep(50);
await pg.evaluate(() => { const t = document.querySelector('#c').firstChild; const r = document.createRange(); r.setStart(t, 0); r.setEnd(t, 7); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await altQ();
check('ID tag repeats on the selection', /<span class="id">Charlie<\/span>/.test(await html('#c')), await html('#c'));

// inserts: code block, Q&A list, note
await load(pg, DOC); await caretIn(pg, '#a'); await click(pg, 'code'); await sleep(50); await caretIn(pg, '#c'); await altQ();
same('Insert code block repeats', await pg.evaluate(() => document.querySelectorAll('#doc pre').length), 2);
await caretIn(pg, '#a'); await click(pg, 'qa'); await sleep(50); await caretIn(pg, '#d'); await altQ();
same('Insert Q&A list repeats', await pg.evaluate(() => document.querySelectorAll('#doc dl.qa').length), 2);
await load(pg, DOC); await caretIn(pg, '#a'); await click(pg, 'note'); await sleep(80); await K.type('first'); await caretIn(pg, '#c'); await altQ(); await K.type('second'); await sleep(50);
same('Note repeats on another block', await pg.evaluate(() => [...document.querySelectorAll('#doc .note .note-body')].map(n => n.textContent)), ['Alpha beta', 'Charlie']);

// table commands: add and delete, and nothing outside a table
await load(pg, DOC); await caretCell(pg, 0, 1, 0); await click(pg, 'r+'); await sleep(50); await caretCell(pg, 0, 1, 0); await altQ(); await caretCell(pg, 0, 1, 0); await altQ();
same('Add row below repeats', await shape(pg), '. . | . . | . . | . . | . .');
await caretCell(pg, 0, 1, 0); await click(pg, 'cl'); await sleep(50); await caretCell(pg, 0, 1, 0); await altQ();
same('Add column left repeats', await shape(pg), '. . . . | . . . . | . . . . | . . . . | . . . .');
await caretCell(pg, 0, 1, 0); await click(pg, 'c-'); await sleep(50); await caretCell(pg, 0, 1, 0); await altQ();
same('Delete column repeats', await shape(pg), '. . | . . | . . | . . | . .');
await caretCell(pg, 0, 2, 0); await click(pg, 'r-'); await sleep(50); await caretCell(pg, 0, 2, 0); await altQ();
same('Delete row repeats', await shape(pg), '. . | . . | . .');
const n0 = dialogs.length; await caretIn(pg, '#a'); await altQ();
check('a table command outside a table does nothing and shows no message', dialogs.length === n0 && (await shape(pg)) === '. . | . . | . .' && (await tags()) === 'H1,P,P,P,P,DIV.tw,P');
await caretCell(pg, 0, 1, 0); await click(pg, 'dense'); await sleep(50); await caretCell(pg, 0, 1, 1); await altQ();
check('Compact table is set, not toggled, by a repeat', await pg.evaluate(() => document.querySelector('#doc table').classList.contains('dense')));

// commands that are not repeatable leave the last one in place; a new document clears it
await caretIn(pg, '#a'); await pg.select('#s-block', 'h2'); await sleep(50); await click(pg, 'margin'); await click(pg, 'undo'); await click(pg, 'redo'); await sleep(50);
same('Notes margin, Undo and Redo do not replace the command', (await btn())[1].split(': ')[1].split(' (')[0], 'H2');
// a link under Alt + click is not opened
let opened = 0; pg.on('popup', () => opened++);
await pg.evaluate(() => { const a = document.querySelector('#l a'); const r = document.createRange(); r.selectNodeContents(a); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); a.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, altKey: true, button: 0 })); window.__dp = !a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true, button: 0 })); }); await sleep(150);
check('Alt + click on a link repeats the command and does not open or download the link', (await pg.evaluate(() => window.__dp)) && opened === 0 && /^H1,H2,.*,H2$/.test(await tags()), await tags());
await pg.evaluate(() => { window.confirm = () => true; document.querySelector('[data-a="new"]').click(); }); await sleep(100);
same('a new document has nothing to repeat', (await btn())[0], true);
same('no page errors', errors, []);
await b.close();
