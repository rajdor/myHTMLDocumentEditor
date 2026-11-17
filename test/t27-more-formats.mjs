// More formats: one toolbar list holds superscript, subscript, strike-through and inline code. Choosing one switches
// it on or off for the selected text, and the list ticks the ones that are on at the cursor. Pasted strike-through is kept.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const html = (sel) => pg.evaluate((sel) => document.querySelector(sel).innerHTML, sel);
const selectText = (sel, from, to) => pg.evaluate((sel, from, to) => { const n = document.querySelector(sel).firstChild, r = document.createRange(); r.setStart(n, from); r.setEnd(n, to); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel, from, to);
const pick = async (v) => { await pg.select('#s-fmt', v); await sleep(80); };
const labels = () => pg.evaluate(() => [...document.querySelectorAll('#s-fmt option')].map(o => o.textContent));
const DOC = '<main><h1>T</h1><p id="a">H2O and x2 and old and run it</p><p id="b">plain</p><pre id="pre">code block</pre><p id="c">one</p><p id="d">two</p></main>';
await load(pg, DOC);
same('the list offers the four formats', await labels(), ['More', 'Superscript', 'Subscript', 'Strike-through', 'Inline code']);
await selectText('#a', 1, 2); await pick('sub');
same('Subscript', (await html('#a')).slice(0, 15), 'H<sub>2</sub>O ');
same('the list goes back to its name, ready for the next choice', await pg.$eval('#s-fmt', s => s.value), '');
await caretIn(pg, '#a sub'); await sleep(60); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(80);
check('the list ticks the format that is on at the cursor', (await labels()).includes('✓ Subscript') && (await labels()).includes('Superscript'), await labels());
await pg.evaluate(() => { const n = document.querySelector('#a sub').nextSibling, i = n.data.indexOf('x2') + 1, r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 1); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await pick('sup'); check('Superscript', (await html('#a')).includes('x<sup>2</sup>'), await html('#a'));
await pg.evaluate(() => { const n = document.querySelector('#a').lastChild, i = n.data.indexOf('old'), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 3); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await pick('strike'); check('Strike-through, written as <s>', (await html('#a')).includes('<s>old</s>') && !(await html('#a')).includes('strike'), await html('#a'));
await pg.evaluate(() => { const n = document.querySelector('#a').lastChild, i = n.data.indexOf('run it'), r = document.createRange(); r.setStart(n, i); r.setEnd(n, i + 6); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await pick('code'); check('Inline code', (await html('#a')).endsWith('<code>run it</code>'), await html('#a'));
check('inline code uses the code font', /JetBrains Mono/.test(await pg.evaluate(() => getComputedStyle(document.querySelector('#a code')).fontFamily)));
check('the saved file keeps all four', await pg.evaluate(() => { const o = FLE.build(); return o.includes('<sub>2</sub>') && o.includes('<sup>2</sup>') && o.includes('<s>old</s>') && o.includes('<code>run it</code>'); }));
// choosing again switches it off
await caretIn(pg, '#a code'); await pick('code'); check('choosing Inline code again, with the cursor in it, takes it off', (await html('#a')).endsWith('and run it'), await html('#a'));
await pg.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#a s')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await pick('strike'); check('choosing Strike-through again takes it off', !(await html('#a')).includes('<s>') && (await html('#a')).includes(' old '), await html('#a'));
await pg.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#a sub')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await pick('sub'); check('and Subscript', (await html('#a')).startsWith('H2O '), await html('#a'));
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
check('undo brings it back', (await html('#a')).startsWith('H<sub>2</sub>O'), await html('#a'));
// repeat
await selectText('#b', 0, 5); await pick('strike'); await selectText('#c', 0, 3); await click(pg, 'repeat'); await sleep(80);
same('the repeat key repeats the last format', await html('#c'), '<s>one</s>');
// limits
await selectText('#pre', 0, 4); await pick('code'); await pick('sup');
same('a code block is left alone', await html('#pre'), 'code block');
const t = await open(); await load(t.pg, DOC);
await t.pg.evaluate(() => { const r = document.createRange(); r.setStart(document.querySelector('#c').firstChild, 0); r.setEnd(document.querySelector('#d').firstChild, 3); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await t.pg.select('#s-fmt', 'code'); await sleep(100);
check('inline code across paragraphs is refused with a reason', !(await t.pg.evaluate(() => !!document.querySelector('#doc code'))) && t.dialogs.some(d => /Inline code is for text inside one paragraph/.test(d)), t.dialogs);
await t.b.close();
// Clear format takes them all off
await load(pg, '<main><h1>T</h1><p id="a">a<sup>1</sup> b<sub>2</sub> <s>c</s> <code>d</code></p></main>');
await pg.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#a')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'clear'); await sleep(100);
same('Clear format removes all four', await html('#doc p'), 'a1 b2 c d');
// paste keeps strike-through
const paste = (h) => pg.evaluate((h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', 'x'); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h);
await load(pg, '<main><h1>T</h1><p id="a">x</p></main>'); await caretIn(pg, '#a');
await paste('<span>keep <strike>one</strike> <del>two</del> <span style="text-decoration: line-through">three</span> <s style="color:red">four</s> <span style="text-decoration:underline">five</span></span>'); await sleep(150);
same('pasted strike-through is kept, as <s>, whichever way it was written', await html('#a'), 'xkeep <s>one</s> <s>two</s> <s>three</s> <s>four</s> five');
check('the toolbar is still one row with Help at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), tb = document.getElementById('tbar').getBoundingClientRect(); return tb.right - h.right < 20 && h.top - tb.top < 20; }));
await load(pg, '<main><h1>T</h1><div class="tw"><table><tbody><tr><td id="a">x</td><td>y</td></tr></tbody></table></div></main>'); await caretIn(pg, '#a'); await sleep(200);
check('and still one row with the table buttons showing', await pg.evaluate(() => { const bs = [...document.querySelectorAll('#tbar button, #tbar select')].filter(x => x.offsetParent); const tops = bs.map(x => Math.round(x.getBoundingClientRect().top / 20)); return !document.querySelector('#tbar .tops').hidden && new Set(tops).size === 1; }));
same('no page errors', errors, []);
await b.close();
