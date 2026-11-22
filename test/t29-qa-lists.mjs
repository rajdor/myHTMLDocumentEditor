// Lists inside a Q&A answer. The list buttons make a list from the line the cursor is on, or the selected lines,
// inside the answer; the Q&A list itself stays whole. Enter on an empty item, Backspace at the start of an item, or
// the same list button again, goes back to plain answer text. A question cannot hold a list.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const dl = () => pg.evaluate(() => { const c = document.querySelector('#doc dl').cloneNode(true); c.querySelectorAll('[id]').forEach(e => e.removeAttribute('id')); return c.outerHTML; });
const whole = () => pg.evaluate(() => { const d = document.getElementById('doc'); return d.querySelectorAll('dl.qa').length === 1 && [...d.querySelector('dl.qa').childNodes].every(n => n.nodeType === 1 && /^(DT|DD)$/.test(n.tagName)) && !d.querySelector('dl [style]'); });
const DOC = '<main><h1>T</h1><dl class="qa"><dt id="q">Question</dt><dd id="a">Intro<br>first<br>second<br>Outro</dd><dt>Next</dt><dd>Plain</dd></dl><p id="p">after</p></main>';
const lineCaret = (text, off) => pg.evaluate((text, off) => { const n = [...document.querySelector('#a').childNodes].find(x => x.nodeType === 3 && x.data === text); getSelection().collapse(n, off === undefined ? n.length : off); document.getElementById('doc').focus(); document.dispatchEvent(new Event('selectionchange')); }, text, off);
await load(pg, DOC);
await lineCaret('first', 2); await sleep(60); await click(pg, 'ul'); await sleep(100);
same('Bullet list in an answer makes a list from the line the cursor is on', await dl(), '<dl class="qa"><dt>Question</dt><dd>Intro<br><ul><li>first</li></ul>second<br>Outro</dd><dt>Next</dt><dd>Plain</dd></dl>');
check('the Q&A list stays whole', await whole());
same('the cursor stays where it was', await pg.evaluate(() => getSelection().anchorNode.data + '@' + getSelection().anchorOffset), 'first@2');
await lineCaret('second'); await click(pg, 'ul'); await sleep(100);
same('the next line joins the list above it', await dl(), '<dl class="qa"><dt>Question</dt><dd>Intro<br><ul><li>first</li><li>second</li></ul>Outro</dd><dt>Next</dt><dd>Plain</dd></dl>');
await K.press('Enter'); await K.type('third'); await sleep(80);
same('Enter in an item adds an item', await dl(), '<dl class="qa"><dt>Question</dt><dd>Intro<br><ul><li>first</li><li>second</li><li>third</li></ul>Outro</dd><dt>Next</dt><dd>Plain</dd></dl>');
await K.press('Enter'); await sleep(60); await K.press('Enter'); await sleep(80); await K.type('back'); await sleep(80);
same('Enter on an empty item leaves the list and stays in the answer', await dl(), '<dl class="qa"><dt>Question</dt><dd>Intro<br><ul><li>first</li><li>second</li><li>third</li></ul>back<br>Outro</dd><dt>Next</dt><dd>Plain</dd></dl>');
check('the Q&A list is still whole', await whole());
// kinds
await caretIn(pg, '#a li'); await click(pg, 'ol'); await sleep(100);
check('Numbered list on a bullet list changes its kind', (await dl()).includes('<ol><li>first</li><li>second</li><li>third</li></ol>') && await whole(), await dl());
await click(pg, 'check'); await sleep(100);
check('Checklist changes it to a checklist, with boxes', await pg.evaluate(() => { const l = document.querySelector('#a > ul.check'); return !!l && l.querySelectorAll(':scope > li > input[type=checkbox]').length === 3; }) && await whole(), await dl());
await click(pg, 'ul'); await sleep(100);
check('Bullet list changes it back and the boxes go', (await dl()).includes('<ul><li>first</li><li>second</li><li>third</li></ul>') && !(await dl()).includes('input'), await dl());
// the same button takes the item out
await caretIn(pg, '#a li:last-child'); await click(pg, 'ul'); await sleep(100);
same('the same list button takes the item back out, as a line of the answer', await dl(), '<dl class="qa"><dt>Question</dt><dd>Intro<br><ul><li>first</li><li>second</li></ul>third<br>back<br>Outro</dd><dt>Next</dt><dd>Plain</dd></dl>');
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
check('undo puts it back', (await dl()).includes('<li>third</li>'));
// Backspace at the start of an item
await pg.evaluate(() => { getSelection().collapse(document.querySelector('#a li:last-child').firstChild, 0); }); await K.press('Backspace'); await sleep(100);
check('Backspace at the start of an item takes it out of the list', (await dl()).includes('<ul><li>first</li><li>second</li></ul>third<br>back') && await whole(), await dl());
// indent inside an answer
await caretIn(pg, '#a li:last-child'); await K.press('Tab'); await sleep(100);
check('Tab indents an item inside an answer', (await dl()).includes('<ul><li>first<ul><li>second</li></ul></li></ul>') && await whole(), await dl());
// several lines at once
await load(pg, DOC);
await pg.evaluate(() => { const t = [...document.querySelector('#a').childNodes].filter(x => x.nodeType === 3), r = document.createRange(); r.setStart(t[1], 1); r.setEnd(t[2], 3); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'ol'); await sleep(100);
same('selected lines each become an item', await dl(), '<dl class="qa"><dt>Question</dt><dd>Intro<br><ol><li>first</li><li>second</li></ol>Outro</dd><dt>Next</dt><dd>Plain</dd></dl>');
// formatting in the line is kept; an empty answer
await load(pg, '<main><h1>T</h1><dl class="qa"><dt id="q">Question</dt><dd id="a">Use <b>bold</b> and <a href="https://example.com/">a link</a></dd><dt>Two</dt><dd id="e"><br></dd></dl></main>');
await caretIn(pg, '#a b'); await click(pg, 'check'); await sleep(100);
check('formatting on the line is kept in the item', await pg.evaluate(() => { const li = document.querySelector('#a > ul.check > li'); return !!li && !!li.querySelector('b') && !!li.querySelector('a[href]') && li.textContent === 'Use bold and a link'; }), await dl());
await caretIn(pg, '#e'); await click(pg, 'ul'); await sleep(100); await K.type('item'); await sleep(80);
check('a list can start an empty answer', await pg.evaluate(() => document.querySelector('#e').innerHTML === '<ul><li>item</li></ul>'), await dl());
// after the list, the Q&A keys work as before
await load(pg, '<main><h1>T</h1><dl class="qa"><dt id="q">Question</dt><dd id="a">only</dd></dl></main>');
await caretIn(pg, '#a'); await click(pg, 'ul'); await sleep(80); await K.press('Enter'); await sleep(60); await K.press('Enter'); await sleep(80);
await K.press('Enter'); await sleep(100); await K.type('Second question'); await sleep(80);
same('after leaving the list, Enter on the empty line starts the next question as before', await dl(), '<dl class="qa"><dt>Question</dt><dd><ul><li>only</li></ul></dd><dt>Second question</dt></dl>');
// questions
await load(pg, DOC); const before = await dl();
await caretIn(pg, '#q'); await sleep(60); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(60);
check('in a question the list buttons are dimmed', await pg.evaluate(() => ['ul', 'ol', 'check'].every(a => document.querySelector('#chrome [data-a="' + a + '"]').classList.contains('dim'))));
for (const a of ['ul', 'ol', 'check']) { await click(pg, a); await sleep(80); }
same('and do nothing', await dl(), before);
await caretIn(pg, '#p'); await sleep(60); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(60);
check('outside a question they are live again', await pg.evaluate(() => ['ul', 'ol', 'check'].every(a => !document.querySelector('#chrome [data-a="' + a + '"]').classList.contains('dim'))));
await click(pg, 'ul'); await sleep(100);
check('and lists outside a Q&A work as before', await pg.evaluate(() => { const l = document.querySelector('#doc > ul'); return !!l && l.textContent === 'after'; }));
// saved
await load(pg, DOC); await lineCaret('first'); await click(pg, 'check'); await sleep(100);
const out = await pg.evaluate(() => FLE.build());
check('the saved file keeps the list inside the answer', /<dd[^>]*>Intro<br><ul class="check"><li><input type="checkbox" aria-label="first">first<\/li><\/ul>second<br>Outro<\/dd>/.test(out.replace(/\s*\n\s*/g, '')), out.slice(out.indexOf('<dl'), out.indexOf('</dl>') + 5));
same('no page errors', errors, []);
await b.close();
