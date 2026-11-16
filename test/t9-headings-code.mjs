// Heading levels H1 to H4 with subtitles, the index depth setting (saved with the document, 1 by default),
// code blocks (new lines, tab, leaving the block, paste) and Clear format.
import { open, check, same, caretIn, click, sleep, load } from './harness.mjs';
const { b, pg } = await open();
const K = pg.keyboard;
const style = () => pg.evaluate(() => { const s = document.getElementById('s-block'); return s.value + '|' + s.options[s.selectedIndex].text; });
const labels = await pg.evaluate(() => [...document.querySelectorAll('#s-block option')].map(o => o.text));
check('Style list has H1 to H4 and subtitles', ['H1', 'H1-subtitle', 'H2', 'H2-subtitle', 'H3', 'H4', 'Code block'].every(l => labels.includes(l)), labels);

const DOC = '<main><h1>T</h1><p class="sub">S</p><h2>A</h2><p class="h2sub">A sub</p><h3>A1</h3><h4>A1a</h4><h3>A2</h3><h2>B</h2><h4>B deep</h4><p>x</p></main>';
await load(pg, DOC);
const index = () => pg.evaluate(() => { const r = ol => [...ol.children].map(li => { const sub = li.querySelector(':scope > ol'); return li.firstChild.textContent + (sub ? '(' + r(sub).join(',') + ')' : ''); }); return r(document.getElementById('idx')); });
same('index defaults to 1 level (H2 only)', await index(), ['A', 'B']);
same('Index list shows 1 level', await pg.$eval('#s-index', s => s.value), '1');
await pg.select('#s-index', '2'); await sleep(50);
same('2 levels adds H3', await index(), ['A(A1,A2)', 'B']);
await caretIn(pg, '#doc p.h2sub'); same('Style shows H2-subtitle', await style(), 'p.h2sub|H2-subtitle');
await caretIn(pg, '#doc h4'); same('Style shows H4', await style(), 'h4|H4');
await pg.select('#s-index', '3'); await sleep(50);
same('3 levels adds H4', await index(), ['A(A1(A1a),A2)', 'B(B deep)']);
await pg.select('#s-index', '1'); await sleep(50);
same('1 level shows H2 only', await index(), ['A', 'B']);
const saved1 = await pg.evaluate(() => FLE.build());
check('saved document records depth 1', saved1.includes('data-depth="1"') && !saved1.includes('<ol><li><a href="#a1"'));
await load(pg, saved1); same('reloaded document keeps depth 1', await pg.$eval('#s-index', s => s.value), '1');
await load(pg, DOC.replace('<main>', '<nav data-depth="3"></nav><main>')); same('a saved depth is kept on open', await pg.$eval('#s-index', s => s.value), '3');
await load(pg, DOC);
const savedD = await pg.evaluate(() => FLE.build());
check('saved document defaults to 1 level', savedD.includes('data-depth="1"') && !savedD.includes('<a href="#a1">A1</a>'));
await pg.select('#s-index', '2'); await sleep(50);
const saved2 = await pg.evaluate(() => FLE.build());
check('saved document records depth 2', saved2.includes('data-depth="2"') && saved2.includes('<a href="#a1">A1</a>') && !saved2.includes('href="#a1a"'), saved2.slice(saved2.indexOf('<nav'), saved2.indexOf('</nav>')));
check('H3 and H4 get link targets', saved2.includes('<h3 id="a1">') && saved2.includes('<h4 id="a1a">'));
await pg.evaluate(() => document.querySelector('[data-a="new"]').click()); await sleep(100);
same('new document starts at 1 level', await pg.$eval('#s-index', s => s.value), '1');

// code block
await caretIn(pg, '#doc p:last-child'); await click(pg, 'code');
await K.type('line one'); await K.press('Enter'); await K.press('Tab'); await K.type('line two');
await K.press('Enter'); await K.press('Enter'); await K.type('After code');
const code = await pg.evaluate(() => { const p = document.querySelector('#doc pre'); return { text: p.innerText.replace(/\n+$/, ''), next: p.nextElementSibling.tagName + ':' + p.nextElementSibling.textContent, count: document.querySelectorAll('#doc pre').length }; });
same('code block keeps lines and tab', code.text, 'line one\n\tline two');
same('Enter on an empty last line leaves the block', code.next, 'P:After code');
same('one code block', code.count, 1);
await caretIn(pg, '#doc pre'); same('Style shows Code block', await style(), 'pre|Code block');
await pg.evaluate(() => { const dt = new DataTransfer(); dt.setData('text/plain', 'a\nb'); document.querySelector('#doc pre').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); });
same('paste stays in the code block', await pg.evaluate(() => [document.querySelectorAll('#doc pre').length, document.querySelector('#doc pre').innerText.replace(/\n+$/, '')]), [1, 'line one\n\tline twoa\nb']);

// clear formatting
await load(pg, '<main><h1>T</h1><h3>Head <b>bold</b></h3><p class="bluf"><i>it</i> <a href="#">ln</a> <span class="id">A1</span></p><dl class="qa"><dt>Q1</dt><dd>A1</dd><dt>Q2</dt><dd>A2</dd></dl><table><tr><td><b>c</b></td></tr></table></main>');
await caretIn(pg, '#doc h3'); await click(pg, 'clear'); await sleep(50);
same('heading becomes a plain paragraph', await pg.evaluate(() => document.querySelector('#doc h1').nextElementSibling.outerHTML), '<p>Head bold</p>');
await pg.evaluate(() => { const a = document.querySelector('#doc p.bluf'), z = document.querySelector('#doc dl dd'); const r = document.createRange(); r.setStart(a, 0); r.setEnd(z, 1); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await click(pg, 'clear'); await sleep(50);
same('selection cleared across blocks; Q&A list splits', await pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(n => n.tagName + (n.className ? '.' + n.className : '') + ':' + (n.tagName === 'DL' ? n.children.length : n.innerHTML))),
  ['H1:T', 'P:Head bold', 'P:it <a href="#">ln</a> <span class="id">A1</span>', 'P:Q1', 'P:A1', 'DL.qa:2', 'TABLE:' + await pg.evaluate(() => document.querySelector('#doc table').innerHTML)]);
await caretIn(pg, '#doc td'); await click(pg, 'clear'); await sleep(50);
same('table cell keeps its cell, loses bold', await pg.evaluate(() => document.querySelector('#doc td').innerHTML), 'c');
await b.close();
