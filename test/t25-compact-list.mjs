// Compact list: a button beside the list buttons puts less space between the lines of the list the cursor is in,
// inner lists included; pressing it again goes back. It works for bulleted and numbered lists and checklists.
import { open, check, same, caretIn, sleep, load, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><p id="p">Para</p><ul id="u"><li>one</li><li id="in">two<ul><li id="deep">inner</li></ul></li><li>three</li></ul><ol id="o"><li>n1</li><li>n2</li></ol><ul class="check" id="c"><li><input type="checkbox">c1</li><li><input type="checkbox">c2</li></ul><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td><ul id="t"><li>t1</li><li>t2</li></ul></td></tr></tbody></table></div></main>';
const gap = (s) => pg.evaluate((s) => { const l = document.querySelectorAll(s + ' > li'); return Math.round((l[1].getBoundingClientRect().top - l[0].getBoundingClientRect().top) * 10) / 10; }, s);
const btn = () => pg.evaluate(() => { const x = document.querySelector('[data-a="ldense"]'); return [x.classList.contains('on'), x.classList.contains('dim'), !!x.closest('[aria-label="Lists"]')]; });

await load(pg, DOC);
await caretIn(pg, '#p'); await sleep(60);
same('Compact list sits with the list buttons and is dimmed outside a list', await btn(), [false, true, true]);
const g0 = await gap('#u');
await caretIn(pg, '#u li'); await sleep(60);
same('in a list it is ready and not lit', await btn(), [false, false, true]);
await click(pg, 'ldense'); await sleep(80);
const g1 = await gap('#u');
check('Compact list puts less space between the lines of the list', g1 < g0 - 2, [g0, g1]);
same('the list carries the setting and keeps its items', await pg.evaluate(() => [document.querySelector('#u').className, document.querySelectorAll('#u > li').length]), ['dense', 3]);
same('the button is lit while the cursor is in that list', (await btn())[0], true);
check('inner lists are compact too', await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#deep')).lineHeight) < 20));
check('other lists are left alone', (await gap('#o')) === (await gap('#c')) && (await gap('#o')) > g1, [await gap('#o'), await gap('#c')]);
await caretIn(pg, '#deep'); await sleep(60); await click(pg, 'ldense'); await sleep(80);
check('from an inner list the button acts on the whole list: here it goes back to normal', (await gap('#u')) === g0 && await pg.evaluate(() => !document.querySelector('#u').hasAttribute('class') && !document.querySelector('#u ul').hasAttribute('class')));
// numbered lists, checklists and lists in tables
const o0 = await gap('#o'); await caretIn(pg, '#o li'); await click(pg, 'ldense'); await sleep(80);
check('a numbered list can be compact', (await gap('#o')) < o0 - 2);
const c0 = await gap('#c'); await caretIn(pg, '#c li'); await click(pg, 'ldense'); await sleep(80);
check('a checklist can be compact and stays a checklist', (await gap('#c')) < c0 - 2 && await pg.evaluate(() => document.querySelector('#c').className === 'check dense' && document.querySelectorAll('#c input').length === 2));
const t0 = await gap('#t'); await caretIn(pg, '#t li'); await click(pg, 'ldense'); await sleep(80);
check('a list in a table cell can be compact', (await gap('#t')) < t0 - 1);
// undo, save and re-open
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes the last change back', await gap('#t'), t0);
await sleep(450); const saved = await pg.evaluate(() => FLE.build());
check('compact lists are saved', /<ol[^>]*class="dense"/.test(saved) && /<ul class="check dense"/.test(saved) && /ul\.dense, ol\.dense \{ line-height: 1\.25; \}/.test(saved));
await load(pg, saved); check('and open compact', (await gap('#doc ol')) < o0 - 2);
// repeat
await load(pg, DOC); await caretIn(pg, '#u li'); await click(pg, 'ldense'); await sleep(60); await caretIn(pg, '#o li'); await click(pg, 'repeat'); await sleep(80); await click(pg, 'repeat'); await sleep(80);
same('Repeat makes the next list compact, and sets rather than toggles', await pg.evaluate(() => [document.querySelector('#u').className, document.querySelector('#o').className]), ['dense', 'dense']);
check('the toolbar is still one row with Help and Thin toolbar at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return t.right - h.right < 45 && h.top - t.top < 20; }));
same('no page errors', errors, []);
await b.close();
