// Emoji: the toolbar button opens a list; a click puts that emoji in where the cursor is, in a paragraph, a table cell
// or a code block. The saved page holds it as an HTML code and re-opens the same. Repeat and undo work on it.
import { open, check, same, load, sleep, caretIn, caretCell, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const text = (sel) => pg.evaluate((sel) => document.querySelector(sel).textContent, sel);
const shown = () => pg.$eval('#emoji', e => !e.hidden);
const pick = async (tip) => { if (!(await shown())) { await click(pg, 'emoji'); await sleep(60); } await pg.click('#emoji button[title="' + tip + '"]'); await sleep(80); };
const HEART = '❤️', SMILEY = '\u{1F603}', TICK = '✅';
await load(pg, '<main><h1>T</h1><p id="a">one two</p><p id="b">swap this out</p><pre id="pre">code</pre><table><tr><td>cell</td><td>next</td></tr></table><p id="c">again</p></main>');

check('the list is closed to start with', !(await shown()));
await caretIn(pg, '#a'); await click(pg, 'emoji'); await sleep(60);
check('the Emoji button opens the list under the toolbar', await shown() && await pg.evaluate(() => document.querySelector('#emoji').getBoundingClientRect().top >= document.querySelector('[data-a="emoji"]').getBoundingClientRect().bottom));
const list = await pg.evaluate(() => [...document.querySelectorAll('#emoji button')].map(x => [x.textContent, x.title]));
same('it holds the 39 emoji of the default set', list.length, 39);
check('every one has a tooltip', list.every(x => x[1]));
check('the tick is the green check mark, and the blue circle and the black and white squares are in', ['✅', '\u{1F535}', '⬛', '⬜'].every(c => list.some(x => x[0] === c)) && !list.some(x => x[0].startsWith('✔')));
check('the two-part emoji keep their second part', ['❤️', '☠️', '‼️', '⚠️'].every(c => list.some(x => x[0] === c)));
await pick('Smiley');
same('a click puts the emoji in where the cursor is', await text('#a'), 'one two' + SMILEY);
check('and closes the list', !(await shown()));
await K.type('!');
same('typing carries on after it', await text('#a'), 'one two' + SMILEY + '!');
await pg.evaluate(() => { const n = document.querySelector('#a').firstChild, r = document.createRange(); r.setStart(n, 3); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }); await sleep(40);
await pick('Heart');
same('in the middle of a line it goes in at the cursor', await text('#a'), 'one' + HEART + ' two' + SMILEY + '!');
await pg.evaluate(() => { const n = document.querySelector('#b').firstChild, r = document.createRange(); r.setStart(n, 5); r.setEnd(n, 9); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }); await sleep(40);
await pick('Check mark');
same('selected text is replaced by it', await text('#b'), 'swap ' + TICK + ' out');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes it out again', await text('#b'), 'swap this out');
await caretIn(pg, '#pre'); await pick('Warning');
same('in a code block it goes in as text', await text('#pre'), 'code⚠️');
await caretCell(pg, 0, 0, 0); await pick('Red circle');
same('in a table cell it stays in the cell', await pg.evaluate(() => [...document.querySelectorAll('#doc td')].map(c => c.textContent)), ['cell\u{1F534}', 'next']);
await caretIn(pg, '#c'); await click(pg, 'repeat'); await sleep(80);
same('Repeat puts the last emoji in again', await text('#c'), 'again\u{1F534}');
check('the Repeat button names it', (await pg.$eval('[data-a="repeat"]', e => e.title)).includes('Emoji \u{1F534}'));

const out = await pg.evaluate(() => FLE.build());
check('a saved page holds each emoji as an HTML code', out.includes('one&#10084;&#65039; two&#128515;!') && out.includes('&#128308;') && !/[^\x00-\x7F]/.test(out));
check('the list itself is never saved with a page', !out.includes('id="emoji"'));
await load(pg, out, 'saved.html');
same('and re-opens with the emoji as they were', await pg.evaluate(() => document.querySelector('#doc p').textContent), 'one' + HEART + ' two' + SMILEY + '!');

await caretIn(pg, '#doc p'); await click(pg, 'emoji'); await sleep(60); await K.press('Escape'); await sleep(60);
check('Esc closes the list and changes nothing', !(await shown()) && await pg.evaluate(() => document.querySelector('#doc p').textContent) === 'one' + HEART + ' two' + SMILEY + '!');
await click(pg, 'emoji'); await sleep(60); await click(pg, 'emoji'); await sleep(60);
check('the button again closes it', !(await shown()));
await click(pg, 'emoji'); await sleep(60); await pg.click('#doc h1'); await sleep(60);
check('a click in the page closes it', !(await shown()));
same('no page errors', errors, []);
await b.close();
