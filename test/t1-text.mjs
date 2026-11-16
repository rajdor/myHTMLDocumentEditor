// Text editing: the Style list follows the cursor, headings build the numbered index, labels keep their typed case,
// and Q&A lists behave (Enter moves question to answer, new lines in answers, new question, end of list, conversion).
import { open, check, same, caretIn, click, sleep } from './harness.mjs';
const { b, pg } = await open();
const style = () => pg.evaluate(() => { const s = document.getElementById('s-block'); return s.value + '|' + s.options[s.selectedIndex].text; });

await caretIn(pg, '#doc h1'); same('Style shows H1 in the title', await style(), 'h1|H1');
await caretIn(pg, '#doc p.sub'); same('Style shows H1-subtitle', await style(), 'p.sub|H1-subtitle');
await caretIn(pg, '#doc h2'); same('Style shows H2', await style(), 'h2|H2');

// new section heading appears in the index
await caretIn(pg, '#doc p:last-child'); await pg.keyboard.press('Enter'); await pg.keyboard.type('Second section');
await pg.select('#s-block', 'h2'); await sleep(600);
same('index lists both sections', await pg.evaluate(() => [...document.querySelectorAll('#idx a')].map(a => a.textContent)), ['Section', 'Second section']);
same('Style shows the new heading', await style(), 'h2|H2');

// no style forces capitals
const caps = await pg.evaluate(() => [...document.styleSheets].flatMap(s => [...s.cssRules]).filter(r => /uppercase/.test(r.cssText)).length);
same('no rule forces capitals', caps, 0);

// Q&A
await pg.keyboard.press('Enter'); await click(pg, 'qa'); const K = pg.keyboard;
await K.type('Q one'); await K.press('Enter'); await K.type('A one'); await K.press('Enter'); await K.type('A one, line two');
await K.press('Enter'); await K.press('Enter'); await K.type('Q two'); await K.press('Enter'); await K.type('A two');
await K.press('Enter'); await K.press('Enter'); await K.press('Enter'); await K.type('After the list');
same('Q&A structure', await pg.evaluate(() => { const d = document.querySelector('#doc dl.qa'); return [...d.children].map(n => n.tagName + ':' + n.innerHTML); }),
  ['DT:Q one', 'DD:A one<br>A one, line two', 'DT:Q two', 'DD:A two']);
same('text after the list is a paragraph', await pg.evaluate(() => { const d = document.querySelector('#doc dl.qa').nextElementSibling; return d.tagName + ':' + d.textContent; }), 'P:After the list');
await caretIn(pg, '#doc dl.qa dd'); same('Style shows Q&A answer', await style(), 'dd|Q&A answer');

// paragraph converts to an answer and joins the list before it
await pg.evaluate(() => { const p = document.querySelector('#doc dl.qa').nextElementSibling; const r = document.createRange(); r.selectNodeContents(p); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await pg.select('#s-block', 'dd'); await sleep(50);
same('converted paragraph joins the list', await pg.evaluate(() => [...document.querySelectorAll('#doc dl.qa')].map(d => d.children.length)), [5]);
await b.close();
