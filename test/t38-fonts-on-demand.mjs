// A saved page carries the italic font and the code font only when the page uses them. The body and heading fonts
// are always there. A page that uses neither is about half the size, and looks the same.
import { open, check, same, load, sleep } from './harness.mjs';
const { b, pg, errors } = await open();
const saved = async (body) => { await load(pg, '<main>' + body + '</main>'); const o = await pg.evaluate(() => FLE.build()); return { size: o.length, body: /font-family: 'Instrument Sans'; font-style: normal/.test(o), head: /font-family: 'Architects Daughter'/.test(o), italic: /font-family: 'Instrument Sans'; font-style: italic/.test(o), mono: /@font-face \{ font-family: 'JetBrains Mono'/.test(o), html: o }; };
const fonts = (r) => [r.body, r.head, r.italic, r.mono];

const plain = await saved('<h1>Title</h1><h2>Section</h2><p>Text with <b>bold</b> and a <a href="https://example.com">link</a>.</p><ul><li>one</li></ul><div class="tw"><table><tbody><tr><th>h</th><td>c</td></tr></tbody></table></div>');
same('a page with no italics and no code carries only the body and heading fonts', fonts(plain), [true, true, false, false]);
const both = await saved('<h1>Title</h1><p>Text <i>italic</i></p><pre>code</pre>');
same('a page with italics and code carries all four', fonts(both), [true, true, true, true]);
check('the plain page is about half the size', plain.size < both.size * 0.55, [plain.size, both.size]);

for (const [what, body] of [['<i>', '<p>a <i>b</i></p>'], ['<em>', '<p>a <em>b</em></p>'], ['italic inside bold in a table', '<div class="tw"><table><tbody><tr><td><b><i>x</i></b></td></tr></tbody></table></div>'], ['an inline style', '<p><span style="font-style: italic">x</span></p>']])
  same('italic text made with ' + what + ' brings the italic font, not the code font', fonts(await saved('<h1>T</h1>' + body)).slice(2), [true, false]);
check('an italic tag with no text in it does not count', !(await saved('<h1>T</h1><p>a <i></i> b</p>')).italic);
for (const [what, body] of [['a code block', '<pre>x = 1</pre>'], ['inline code', '<p>a <code>x</code></p>'], ['an ID tag', '<p><span class="id">ID-1</span> text</p>'], ['a Q&A list, whose Q and A labels are drawn by the style sheet', '<dl class="qa"><dt>Question</dt><dd>Answer</dd></dl>']])
  same(what + ' brings the code font, not the italic font', fonts(await saved('<h1>T</h1>' + body)).slice(2), [false, true]);

// the font follows the page: added when first used, dropped when no longer used
await load(pg, plain.html); await sleep(150);
check('a page saved without the fonts re-opens and saves the same', (await pg.evaluate(() => FLE.build())) === plain.html);
await pg.evaluate(() => { const p = document.querySelector('#doc p'); p.innerHTML = 'now <i>italic</i>'; });
let again = await pg.evaluate(() => FLE.build());
check('using italics later brings the font in at the next save', /font-family: 'Instrument Sans'; font-style: italic/.test(again) && !/@font-face \{ font-family: 'JetBrains Mono'/.test(again));
await pg.evaluate(() => { document.querySelector('#doc p').innerHTML = 'plain again'; });
again = await pg.evaluate(() => FLE.build());
check('and removing them drops it again', !/font-style: italic/.test(again));
check('the rest of the style sheet is untouched', plain.html.includes("--mono: 'JetBrains Mono'") && plain.html.includes('pre { font: 13px/1.5 var(--mono)'));
check('the editor itself always has every font', await pg.evaluate(() => { const c = document.querySelector('#doc-css').textContent; return /font-style: italic/.test(c) && /@font-face \{ font-family: 'JetBrains Mono'/.test(c); }));
check('no page errors', errors.length === 0, errors);
await b.close();
