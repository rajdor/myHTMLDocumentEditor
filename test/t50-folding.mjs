// Folding sections while editing: the arrow beside any heading folds what is under it down to the next heading of the
// same or a higher level; nothing of it is saved or put in the history; the page opens unfolded; Collapse all and Expand
// all; Alt+click; folding moves the cursor out to the heading; editing into a folded section opens it; an Index link and
// the browser's Find open the sections above; Undo keeps the folds. The Index lists H1s when a page has more than one.
import { open, load, check, same, sleep } from './harness.mjs';
const { b, pg, errors } = await open();
const DOC = '<main><h1>Title</h1><p class="sub">Sub</p><h2>One</h2><p id="p1">alpha</p><h3>One A</h3><p id="p1a">alpha a</p><h2>Two</h2><p id="p2">bravo needle</p><h4>Two deep</h4><p>deep</p><h2>Three</h2><p id="p3">charlie</p></main>';
await load(pg, DOC);
const hidden = () => pg.evaluate(() => [...document.querySelectorAll('#doc > *')].filter(e => e.classList.contains('ed-fhide')).map(e => /^p/.test(e.id) ? e.id : e.textContent.trim()));
const arrow = (text) => pg.evaluate((t) => { const b = [...document.querySelectorAll('#folds .fold-t')].find(x => x._h && x._h.textContent.trim() === t); if (!b) return null; const r = b.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, text);
const clickArrow = async (t, alt) => { const p = await arrow(t); if (!p) throw new Error('no arrow for ' + t); if (alt) await pg.keyboard.down('Alt'); await pg.mouse.click(p[0], p[1]); if (alt) await pg.keyboard.up('Alt'); await sleep(120); };
same('a page opens with nothing folded, and every heading has an arrow', [await hidden(), await pg.evaluate(() => document.querySelectorAll('#folds .fold-t').length)], [[], 6]);
const nearH = await pg.evaluate(() => { const a = document.querySelector('#folds .fold-t'), h = a._h.getBoundingClientRect(), r = a.getBoundingClientRect(); return r.right <= h.left + 2 && r.top >= h.top - 4 && r.bottom <= h.bottom + 4; });
check('the arrow sits in the margin beside its heading', nearH);
await clickArrow('One');
same('folding an H2 hides down to the next H2, its H3 included', await hidden(), ['p1', 'One A', 'p1a']);
check('the heading shows it is folded and its arrow says Expand', await pg.evaluate(() => document.querySelectorAll('#doc h2')[0].classList.contains('ed-folded')) && /^Expand/.test(await pg.evaluate(() => [...document.querySelectorAll('#folds .fold-t')].find(b => b._h.textContent === 'One').getAttribute('aria-label'))));
const saved = await pg.evaluate(() => FLE.build());
check('nothing of folding goes into the saved page', !/ed-fhide|ed-folded|until-found|fold-t/.test(saved) && /alpha a/.test(saved));
await clickArrow('One');
same('the arrow opens it again', await hidden(), []);
await clickArrow('Title');
same('folding the H1 hides the whole page under it', (await hidden()).length, 11);
await clickArrow('Title');
await pg.click('#idx-fold button[data-f="collapse"]'); await sleep(100);
same('Collapse all folds every heading: only the H1 shows', await hidden(), ['Sub', 'One', 'p1', 'One A', 'p1a', 'Two', 'p2', 'Two deep', 'deep', 'Three', 'p3']);
await pg.click('#idx-fold button[data-f="expand"]'); await sleep(100);
same('Expand all opens everything', await hidden(), []);
await clickArrow('One A', true);
check('Alt+click on an arrow folds every heading', (await hidden()).length === 11);
await clickArrow('Title', true); same('and Alt+click again opens every heading', await hidden(), []);
// the cursor
await pg.evaluate(() => { const p = document.getElementById('p1a'), r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); document.getElementById('doc').focus(); });
await clickArrow('One');
check('folding the section the cursor is in moves the cursor to the end of its heading', await pg.evaluate(() => { const s = getSelection(); let n = s.anchorNode; if (n.nodeType !== 1) n = n.parentElement; return n.closest('h2') && n.closest('h2').textContent === 'One'; }) && (await hidden()).includes('p1a'));
await pg.keyboard.press('End'); await pg.keyboard.press('Enter'); await pg.keyboard.type('new line'); await sleep(500);
check('pressing Enter at the end of a folded heading opens its section to type in', !(await hidden()).length && await pg.evaluate(() => document.querySelectorAll('#doc h2')[0].nextElementSibling.textContent === 'new line'), await hidden());
// Undo keeps folds
await clickArrow('Two'); await pg.evaluate(() => { document.getElementById('p3').textContent = 'charlie changed'; document.getElementById('doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(500);
await pg.keyboard.down('Control'); await pg.keyboard.press('z'); await pg.keyboard.up('Control'); await sleep(200);
check('Undo keeps the folds', (await hidden()).includes('p2'), await hidden());
check('and the history holds no folds', await pg.evaluate(() => !/ed-fhide|until-found/.test(FLE.build())));
// Index link opens the sections above it
await pg.click('#idx-fold button[data-f="collapse"]'); await sleep(100);
await pg.evaluate(() => { const a = [...document.querySelectorAll('#idx a')].find(a => a.textContent === 'Three'); a.click(); }); await sleep(200);
check('an Index link opens the folded sections above its heading, so the heading shows', !(await hidden()).includes('Three') && (await hidden()).includes('p3'), await hidden());
// Find: the browser's beforematch opens the section
await pg.click('#idx-fold button[data-f="expand"]'); await clickArrow('Two');
await pg.evaluate(() => document.getElementById('p2').dispatchEvent(new Event('beforematch', { bubbles: true }))); await sleep(100);
check('a match found by the browser\'s Find opens its section', !(await hidden()).includes('p2'), await hidden());
// a new page opens unfolded
await clickArrow('One'); await load(pg, DOC);
same('a page opened again has nothing folded', await hidden(), []);
// print shows everything
await clickArrow('One'); await pg.emulateMediaType('print');
check('printing shows folded sections', await pg.evaluate(() => getComputedStyle(document.getElementById('p1')).display !== 'none' && getComputedStyle(document.getElementById('p1')).contentVisibility !== 'hidden'));
await pg.emulateMediaType('screen');

/* ----- the Index and more than one H1 ----- */
await load(pg, '<main><h1>Part one</h1><h2>Alpha</h2><p>x</p><h1>Part two</h1><h2>Bravo</h2><p>y</p></main>');
same('with two H1s the Index lists them unnumbered, and the H2s keep their page numbers', await pg.evaluate(() => [...document.querySelectorAll('#idx > li')].map(li => (li.classList.contains('u') ? 'u:' : 'n:') + li.firstChild.textContent)), ['u:Part one', 'n:Alpha', 'u:Part two', 'n:Bravo']);
check('the H1 links lead to the H1s', await pg.evaluate(() => [...document.querySelectorAll('#idx > li.u > a')].every(a => { const t = document.getElementById(a.getAttribute('href').slice(1)); return t && t.tagName === 'H1'; })));
check('the saved page lists them too', /<li class="u"><a href="#part-two">Part two<\/a>/.test(await pg.evaluate(() => FLE.build())));
await load(pg, '<main><h1>Only</h1><h2>Alpha</h2></main>');
same('with one H1 the Index is as before', await pg.evaluate(() => [...document.querySelectorAll('#idx a')].map(a => a.textContent)), ['Alpha']);
same('no page errors', errors, []);
await b.close();
