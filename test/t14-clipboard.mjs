// Copy, cut and paste keep formatting: inline formatting, headings, lists, tables and diagrams copied in the editor come
// back as they were; HTML from other programs keeps its structure and loses its styling; pasted content is cleaned.
import { open, check, same, caretIn, sleep, load } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><h2 id="h">Heading two</h2><p id="a">Plain <b>bold</b> and <i>italic</i> with <a href="https://example.com/x">a link</a> and <span class="id">ID-1</span> end</p><p class="bluf" id="lead">Lead text</p><ul id="l"><li>one</li><li><b>two</b></li></ul><div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td id="cell">c1</td></tr><tr><td>c2</td></tr></tbody></table></div><pre id="code">x = 1</pre><p id="z">Zed</p><p id="e"><br></p></main>';
const html = (s = '#doc') => pg.evaluate(s => document.querySelector(s).innerHTML, s);
// select from (node a, offset) to (node b, offset); a spec is [selector, childIndex or null for the element itself, offset]
const pick = (a, b2) => pg.evaluate((a, b2) => { const at = ([s, i, o]) => { const e = document.querySelector(s); return [i === null ? e : e.childNodes[i], o]; }; const r = document.createRange(); r.setStart(...at(a)); r.setEnd(...at(b2)); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }, a, b2);
const whole = (s) => pg.evaluate(s => { const r = document.createRange(); r.selectNodeContents(document.querySelector(s)); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }, s);
// copy or cut the selection through the editor's own handlers, returning what went to the clipboard
const copy = (type = 'copy') => pg.evaluate(type => { const dt = new DataTransfer(); const ev = new ClipboardEvent(type, { clipboardData: dt, bubbles: true, cancelable: true }); document.getElementById('doc').dispatchEvent(ev); return { html: dt.getData('text/html'), text: dt.getData('text/plain'), handled: ev.defaultPrevented }; }, type);
const paste = (h, t = '') => pg.evaluate((h, t) => { const dt = new DataTransfer(); if (h) dt.setData('text/html', h); dt.setData('text/plain', t); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h, t);

await load(pg, DOC);
// inline formatting inside one paragraph
await pick(['#a', 0, 2], ['#a', 8, 4]);
let c = await copy();
check('copy is handled by the editor and marked as its own', c.handled && c.html.includes('data-fle-clip') && c.text.includes('bold'));
check('copied HTML is clean (no inline styles)', !/style=/.test(c.html), c.html);
await caretIn(pg, '#e'); await paste(c.html, c.text); await sleep(50);
same('bold, italic, link and ID tag are kept on paste', await html('#e'), 'ain <b>bold</b> and <i>italic</i> with <a href="https://example.com/x">a link</a> and <span class="id">ID-1</span> end');
// part of a formatted run keeps its formatting
await load(pg, DOC); await pick(['#a b', 0, 1], ['#a b', 0, 3]); c = await copy();
await caretIn(pg, '#z'); await paste(c.html, c.text); await sleep(50);
same('text copied from inside bold pastes bold', await html('#z'), 'Zed<b>ol</b>');
// whole blocks: heading, styled paragraph, list
await load(pg, DOC); await pick(['#doc h2', 0, 0], ['#l', 1, 1]); c = await copy();
await caretIn(pg, '#e'); await paste(c.html, c.text); await sleep(50);
const after = await pg.evaluate(() => [...document.getElementById('doc').children].slice(-5, -1).map(n => n.tagName + (n.className ? '.' + n.className : '') + ':' + n.textContent));
same('blocks paste as blocks with their styles', after, ['H2:Heading two', 'P:Plain bold and italic with a link and ID-1 end', 'P.bluf:Lead text', 'UL:onetwo']);
check('pasted headings get their own link targets', await pg.evaluate(() => { const ids = [...document.querySelectorAll('#doc h2')].map(h => h.id); return ids.length === 2 && new Set(ids).size === 2; }));
check('the pasted list keeps its bold item', /<ul[^>]*><li>one<\/li><li><b>two<\/b><\/li><\/ul><p><br><\/p>$/.test(await html()), (await html()).slice(-80));
// blocks pasted mid-paragraph split it
await load(pg, DOC); await whole('#doc h2'); c = await copy(); await pick(['#z', 0, 1], ['#z', 0, 1]); await paste('<div data-fle-clip="1"><h3>Mid</h3><p>Para</p></div>'); await sleep(50);
same('pasting blocks inside a paragraph splits it around them', await pg.evaluate(() => [...document.getElementById('doc').children].slice(-5, -1).map(n => n.tagName + ':' + n.textContent)), ['P:Z', 'H3:Mid', 'P:Para', 'P:ed']);
// table rows copied and pasted elsewhere
await load(pg, DOC); await pick(['#doc table tbody tr:nth-child(1) td', 0, 0], ['#doc table tbody tr:nth-child(2) td', 0, 2]); c = await copy();
check('copied rows carry their table', /<div class="tw"><table><tbody><tr><td[^>]*>c1<\/td><\/tr><tr><td>c2<\/td><\/tr><\/tbody><\/table><\/div>/.test(c.html), c.html);
await caretIn(pg, '#e'); await paste(c.html, c.text); await sleep(50);
same('and paste as a table', await pg.evaluate(() => document.querySelectorAll('#doc .tw > table').length), 2);
// into a cell: stays in the cell, formatting kept
await load(pg, DOC); await caretIn(pg, '#cell'); await paste('<div data-fle-clip="1"><p>Line <b>one</b></p><p>Line two</p></div>'); await sleep(50);
same('blocks pasted into a cell stay in the cell as lines, formatting kept', await html('#cell'), 'c1Line <b>one</b><br>Line two');
await load(pg, DOC); await caretIn(pg, '#cell'); await paste('<div data-fle-clip="1"><div class="tw"><table><tbody><tr><td><h4>Label</h4><b>loose bold</b><br>tail</td></tr></tbody></table></div><div>boxed</div></div>'); await sleep(50);
same('text beside a block, or in a plain box, is not left out when pasted into a cell', await html('#cell'), 'c1Label<br><b>loose bold</b><br>tail<br>boxed');
// list items into a list
await load(pg, DOC); await caretIn(pg, '#l li'); await paste('<div data-fle-clip="1"><ul><li>new <i>a</i></li><li>new b</li></ul></div>'); await sleep(50);
same('list items pasted into a list become items', await html('#l'), '<li>one</li><li>new <i>a</i></li><li>new b</li><li><b>two</b></li>');
// code block takes plain text
await load(pg, DOC); await caretIn(pg, '#code'); await paste('<b>y</b>', 'y'); await sleep(50);
same('a code block takes plain text', await html('#code'), 'x = 1y');
// cut removes the selection and keeps formatting on the clipboard
await load(pg, DOC); await pick(['#a', 0, 6], ['#a', 2, 5]); c = await copy('cut'); await sleep(50);
check('cut removes the selection', (await html('#a')).startsWith('Plain <i>italic</i>') || (await html('#a')).startsWith('Plain&nbsp;<i>italic</i>'), await html('#a'));
check('cut keeps the formatting on the clipboard', c.html.includes('<b>bold</b>'), c.html);
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(100);
check('undo restores a cut', (await html('#a')).startsWith('Plain <b>bold</b>'));
await caretIn(pg, '#z'); await paste(c.html, c.text); await sleep(450);
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(100);
same('undo removes a paste', await html('#z'), 'Zed');
// notes do not travel with copied blocks
await load(pg, '<main class="notes-on"><div class="note"><div class="note-body"><p id="n1">Noted one</p><p id="n2">Noted two</p></div><details class="note-log"><summary></summary><div class="note-entries"><p class="note-date"><b>2026.11.15</b></p><p><b class="note-who">JB</b> secret</p></div></details></div><p id="e"><br></p></main>');
await pg.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.getElementById('doc')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); c = await copy();
check('copied blocks leave their note behind', c.html.includes('Noted one') && !/secret|note-log|class="note/.test(c.html), c.html);
// from another program: structure kept, styling dropped, nothing unsafe or remote
await load(pg, DOC); await caretIn(pg, '#e');
await paste('<html><body><!--StartFragment--><h1 style="color:red" class="x">Big</h1><div style="font-family:Arial"><span style="font-weight:700">Strong</span> and <span style="font-style:italic;color:#333">slanted</span> <font color="red">red</font> <a href="https://example.com/" style="color:blue" onclick="x()">site</a> <a href="javascript:alert(1)">bad</a></div><ul><li><p class="MsoNormal">item <b style="font-weight:normal">plain</b></p></li></ul><table border="1" style="width:100%"><tr><td style="background:yellow" colspan="2"><p>cell</p></td></tr></table><img src="https://example.com/p.png" alt="Pic"><script>alert(1)</script><p>&nbsp;</p><!--EndFragment--></body></html>', 'x'); await sleep(50);
const got = await pg.evaluate(() => { const k = [...document.getElementById('doc').children]; const i = k.findIndex(n => n.textContent === 'Big'); return k.slice(i).map(n => n.outerHTML.replace(/ id="[^"]*"/, '')); });
same('heading, paragraph, list and table arrive in the document style', got.slice(0, 4), ['<h2>Big</h2>', '<p><b>Strong</b> and <i>slanted</i> red <a href="https://example.com/">site</a> bad</p>', '<ul><li>item plain</li></ul>', '<div class="tw"><table><tbody><tr><td colspan="2">cell</td></tr></tbody></table></div>']);
check('a web image becomes a link card, not a download', /class="link-card"/.test(got[4] || '') && !/<img/.test(got.join('')), got[4]);
check('no styles, classes from the source, scripts or handlers get in', !/style=|MsoNormal|<script|onclick|javascript:|<font/.test(got.join('')), got.join(''));
// inline HTML from another program into a heading keeps it a heading
await load(pg, DOC); await caretIn(pg, '#doc h2'); await paste('<span style="font-weight:bold">B</span> <em>e</em>', 'B e'); await sleep(50);
same('inline formatting pastes into the current block', await html('#doc h2'), 'Heading two<b>B</b> <em>e</em>');
// plain text only: unchanged behaviour
await load(pg, DOC); await caretIn(pg, '#z'); await paste('', ' plain'); await sleep(50);
same('plain text pastes as text', await html('#z'), 'Zed plain');
same('no page errors', errors, []);
await b.close();
