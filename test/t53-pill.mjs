// Pill and Pill at right, in the More list: a short label in a rounded tag (span.pill), and the same at the
// right-hand edge of its line (span.pill.r). On and off, one kind made into the other, Clear format, Inspect
// formatting, Repeat, undo, save and re-open, the code font carried only when a pill needs it.
import { open, load, check, same, sleep } from './harness.mjs';
const { b, pg, errors, dialogs } = await open({ w: 1440, h: 800 });
const sel = () => pg.evaluate(() => document.dispatchEvent(new Event('selectionchange')));
const pick = async (txt, nth = 0) => { const ok = await pg.evaluate((txt, nth) => { const w = document.createTreeWalker(document.querySelector('#doc'), NodeFilter.SHOW_TEXT); let n, k = 0; while ((n = w.nextNode())) { const i = n.data.indexOf(txt); if (i >= 0 && k++ === nth) { const r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + txt.length); const s = getSelection(); s.removeAllRanges(); s.addRange(r); return true; } } return false; }, txt, nth); await sel(); await sleep(50); return ok; };
const fmt = async (v) => { await pg.select('#s-fmt', v); await sleep(90); };
const pills = () => pg.evaluate(() => [...document.querySelectorAll('#doc .pill')].map(p => p.className + ':' + p.textContent));
const html = (q) => pg.evaluate((q) => document.querySelector(q).innerHTML, q);
const DOC = '<main><h1>T</h1><p id="a">Risk High today</p><p id="b">Second line</p><table><tbody><tr><td>CODE Level 5<br>Name of the skill</td><td>plain</td></tr></tbody></table><ul><li>Item Done</li></ul></main>';
await load(pg, DOC);

/* on */
same('the More list offers Pill and Pill at right', await pg.evaluate(() => [...document.querySelectorAll('#s-fmt option')].slice(-2).map(o => o.value)), ['pill', 'pillr']);
await pick('High'); await fmt('pill');
same('Pill wraps the selected words', await html('#a'), 'Risk <span class="pill">High</span> today');
check('it looks like a pill: rounded, the code font, its own fill, in the line', await pg.evaluate(() => { const cs = getComputedStyle(document.querySelector('#doc .pill')); return parseFloat(cs.borderTopLeftRadius) > 20 && /JetBrains Mono/.test(cs.fontFamily) && cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.float === 'none' && cs.display === 'inline-block'; }));
check('the list ticks Pill while the cursor is in one', /✓ Pill\|Pill at right$/.test(await pg.evaluate(() => [...document.querySelectorAll('#s-fmt option')].map(o => o.textContent).join('|'))));
same('the selection stays on the words', await pg.evaluate(() => getSelection().toString()), 'High');

/* Pill at right, in a table cell */
await pick('Level 5'); await fmt('pillr');
same('Pill at right in a cell', await pg.evaluate(() => document.querySelector('#doc td').innerHTML), 'CODE <span class="pill r">Level 5</span><br>Name of the skill');
check('it sits at the right-hand edge of the same line, and the words before it stay at the left', await pg.evaluate(() => { const p = document.querySelector('#doc td .pill'), c = p.closest('td'), pr = p.getBoundingClientRect(), cr = c.getBoundingClientRect(), r = document.createRange(); r.setStart(c.firstChild, 0); r.setEnd(c.firstChild, 4); const tr = r.getBoundingClientRect(); return getComputedStyle(p).float === 'right' && cr.right - pr.right < 14 && Math.abs(pr.top - tr.top) < 6 && tr.left - cr.left < 14; }));

/* one kind into the other */
await pick('Level 5'); await fmt('pill');
same('Pill on a pill at right makes it a pill, not a pill in a pill', await pills(), ['pill:High', 'pill:Level 5']);
await pick('Level 5'); await fmt('pillr');
same('and back', await pills(), ['pill:High', 'pill r:Level 5']);

/* off */
await pick('Level 5'); await fmt('pillr');
same('the same choice again takes it off', [await pills(), await pg.evaluate(() => document.querySelector('#doc td').innerHTML)], [['pill:High'], 'CODE Level 5<br>Name of the skill']);

/* over several blocks: refused, with a reason */
await pg.evaluate(() => { const a = document.querySelector('#a').lastChild, bb = document.querySelector('#b').firstChild, r = document.createRange(); r.setStart(a, 1); r.setEnd(bb, 6); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }); await sel(); await sleep(50);
const d0 = dialogs.length; await fmt('pill');
check('a pill stays inside one paragraph, and the editor says so', (await pills()).length === 1 && dialogs.length === d0 + 1 && /A pill is for text inside one paragraph/.test(dialogs[dialogs.length - 1]), dialogs.slice(d0));

/* a list item, Repeat */
await pick('Done'); await fmt('pill');
same('in a list item', await pg.evaluate(() => document.querySelector('#doc li').innerHTML), 'Item <span class="pill">Done</span>');
check('Repeat names it', /: Pill \(/.test(await pg.$eval('[data-a="repeat"]', x => x.title)));
await pick('plain'); await pg.keyboard.down('Alt'); await pg.keyboard.press('KeyQ'); await pg.keyboard.up('Alt'); await sleep(150);
same('Repeat last toolbar command makes another', await pg.evaluate(() => document.querySelectorAll('#doc td')[1].innerHTML), '<span class="pill">plain</span>');

/* Inspect formatting */
await pick('plain'); await pg.click('#tbar [data-a="inspect"]'); await sleep(150);
check('Inspect formatting names a pill, as a toolbar format, and can remove it', await pg.evaluate(() => [...document.querySelectorAll('#insp-list li')].some(li => li.querySelector('span').textContent === 'Pill' && !li.classList.contains('odd') && !!li.querySelector('button'))));
await pg.evaluate(() => [...document.querySelectorAll('#insp-list li')].find(li => li.querySelector('span').textContent === 'Pill').querySelector('button').click()); await sleep(200);
same('removed from Inspect formatting', await pg.evaluate(() => document.querySelectorAll('#doc td')[1].innerHTML), 'plain');
await pg.keyboard.press('Escape'); await sleep(60);

/* Clear format */
await pick('Done'); await pg.click('#tbar [data-a="clear"]'); await sleep(200);
same('Clear format takes a pill off', await pg.evaluate(() => document.querySelector('#doc li').textContent + '|' + document.querySelectorAll('#doc li .pill').length), 'Item Done|0');

/* undo */
await sleep(450); await pick('Second'); await fmt('pillr'); await sleep(500);
same('made', (await pills()).includes('pill r:Second'), true);
await pg.click('#tbar [data-a="undo"]'); await sleep(200);
same('one Undo takes it back', (await pills()).includes('pill r:Second'), false);

/* saved and re-opened; the code font only when it is needed */
await pick('Level 5'); await fmt('pillr'); await sleep(100);
const saved = await pg.evaluate(() => FLE.build());
check('saved as span.pill and span.pill.r, with the look in the page', saved.includes('<span class="pill">High</span>') && saved.includes('<span class="pill r">Level 5</span>') && /\.pill \{[^}]*border-radius: 999px/.test(saved) && /\.pill\.r \{ float: right/.test(saved));
check('a page with a pill carries the code font', /@font-face \{ font-family: 'JetBrains Mono'/.test(saved));
await load(pg, saved);
same('re-opened as they were', await pills(), ['pill:High', 'pill r:Level 5']);
await load(pg, '<main><h1>T</h1><p>No pills here</p></main>');
check('a page without one does not', !/@font-face \{ font-family: 'JetBrains Mono'/.test(await pg.evaluate(() => FLE.build())));

/* tidy: a pill with nothing in it goes, and a pill in a pill is one */
await load(pg, '<main><h1>T</h1><p id="a">One <span class="pill"></span>two <span class="pill"><span class="pill r">in</span></span></p></main>');
await pick('One'); await pg.keyboard.press('ArrowRight'); await pg.keyboard.type('x'); await sleep(250);
same('an empty pill goes, and a pill in a pill is one', await pills(), ['pill:in']);
check('no page errors', errors.length === 0, errors);
await b.close();
