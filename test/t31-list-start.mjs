// Start numbering at: a button beside the list buttons sets the first number of the numbered list the cursor is in, so a
// list can carry on from an earlier one. The form offers the number after the nearest numbered list above; the number is
// fixed once set. It is the list's own start attribute, so a saved document needs no script.
import { open, check, same, caretIn, sleep, load, click } from './harness.mjs';
const { b, pg, errors } = await open();
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const DOC = '<main><h1>T</h1><p id="p">Para</p><ol id="a"><li>a1</li><li id="a2">a2<ol id="in1"><li>i1</li><li>i2</li></ol></li><li>a3</li></ol><p>Between</p><ul id="u"><li>bullet</li></ul>'
  + '<ol id="b"><li id="b1">b1<ol id="in2"><li id="i3">i3</li></ol></li><li>b2</li></ol><p>More</p><ol id="c"><li>c1</li></ol>'
  + '<div class="tw"><table><thead><tr><th>H</th></tr></thead><tbody><tr><td><ol id="t"><li>t1</li></ol></td></tr></tbody></table></div></main>';
const btn = () => pg.evaluate(() => { const x = document.querySelector('[data-a="olstart"]'); return [x.classList.contains('on'), x.classList.contains('dim'), !!x.closest('[aria-label="Lists"]')]; });
const dlg = () => pg.evaluate(() => { const d = document.querySelector('#numdlg'); return d.open ? [document.querySelector('#num-start').value, document.querySelector('#num-hint').textContent, document.querySelector('#num-err').textContent] : null; });
const start = (s) => pg.evaluate((s) => { const l = document.querySelector(s); return [l.getAttribute('start'), l.start]; }, s);
const type = async (t) => { await pg.evaluate(() => document.querySelector('#num-start').select()); await K.type(t); };
// where the first item's number is drawn: its width grows with the digits, and the text does not move
const openAt = async (s) => { await caretIn(pg, s); await sleep(60); await click(pg, 'olstart'); await sleep(80); };

await load(pg, DOC);
await caretIn(pg, '#p'); await sleep(60);
same('the button sits with the list buttons and is dimmed outside a list', await btn(), [false, true, true]);
await caretIn(pg, '#u li'); await sleep(60);
same('and in a bullet list', (await btn())[1], true);
await click(pg, 'olstart'); await sleep(60);
same('where it does nothing', await dlg(), null);
await caretIn(pg, '#b1'); await sleep(60);
same('in a numbered list it is ready and not lit', await btn(), [false, false, true]);

// the form offers the number after the list above
await pg.evaluate(() => { const t = document.querySelector('#b1').firstChild, r = document.createRange(); r.setStart(t, 2); r.collapse(true); const g = getSelection(); g.removeAllRanges(); g.addRange(r); }); await sleep(60);
await click(pg, 'olstart'); await sleep(80);
same('the form opens with the next number after the numbered list above', await dlg(), ['4', 'The numbered list above ends at 3.', '']);
await K.press('Enter'); await sleep(80);
same('Enter sets the list to start there', await start('#b'), ['4', 4]);
same('the form closes and the button is lit', [await dlg(), (await btn())[0]], [null, true]);
check('the cursor is back where it was', await pg.evaluate(() => { const s = getSelection(); return s.anchorNode === document.querySelector('#b1').firstChild && s.anchorOffset === 2; }));
same('other lists are untouched', await pg.evaluate(() => ['#a', '#in1', '#in2', '#c', '#t'].map(s => document.querySelector(s).hasAttribute('start'))), [false, false, false, false, false]);
// a list after that one carries on from it, and the form shows a list's own number once it has one
await openAt('#c li');
same('the next list is offered the number after the list that was just set', (await dlg()).slice(0, 2), ['6', 'The numbered list above ends at 5.']);
await K.press('Escape'); await sleep(60);
same('Escape leaves the list alone', [await dlg(), (await start('#c'))[0]], [null, null]);
await openAt('#b1');
same('a list with a number shows its own number', (await dlg())[0], '4');
await type('abc'); await K.press('Enter'); await sleep(60);
same('something that is not a number is refused, and the form stays', [(await dlg())[2], (await start('#b'))[0]], ['Enter a whole number from 0 to 99999.', '4']);
await type('12'); await pg.click('#numdlg [data-a="numsave"]'); await sleep(80);
same('Save sets a typed number', await start('#b'), ['12', 12]);
// the number is fixed: the earlier list changing does not move it
await pg.evaluate(() => { const li = document.createElement('li'); li.textContent = 'a4'; document.querySelector('#a').appendChild(li); });
same('it stays as set when the list above grows', (await start('#b'))[0], '12');
await openAt('#b1');
same('and the form says where the list above now ends', (await dlg())[1], 'The numbered list above ends at 4.');
await pg.click('#numdlg [data-a="numreset"]'); await sleep(80);
same('Back to 1 takes the number off', [await start('#b'), (await btn())[0]], [[null, 1], false]);
await openAt('#b1'); await type('1'); await K.press('Enter'); await sleep(80);
same('and so does setting 1', (await start('#b'))[0], null);
await openAt('#b1'); await type('0'); await K.press('Enter'); await sleep(80);
same('a list can start at 0', await start('#b'), ['0', 0]);

// inner lists, and lists in a table
await openAt('#i3');
same('an inner list is offered the number after the inner list above, not the outer one', (await dlg()).slice(0, 2), ['3', 'The numbered list above ends at 2.']);
await K.press('Enter'); await sleep(80);
same('and only the inner list changes', [(await start('#in2'))[0], (await start('#b'))[0]], ['3', '0']);
await openAt('#a li');
same('the first list has nothing above it', (await dlg()).slice(0, 2), ['1', 'There is no numbered list above this one.']);
await K.press('Escape'); await sleep(60);
await openAt('#t li'); await type('9'); await K.press('Enter'); await sleep(80);
same('a list in a table cell can be set', (await start('#t'))[0], '9');

// undo, save and re-open
await sleep(450); await K.down(mod); await K.press('z'); await K.up(mod); await sleep(150);
same('undo takes the last change back', await pg.evaluate(() => document.querySelector('#doc table ol').getAttribute('start')), null);
await sleep(450); const saved = await pg.evaluate(() => FLE.build());
check('the number is saved as the list\'s own start', /<ol[^>]*start="3"/.test(saved) && /<ol[^>]*start="0"/.test(saved), saved.match(/<ol[^>]*>/g));
await load(pg, saved);
same('and is there when the document is opened again', await pg.evaluate(() => [...document.querySelectorAll('#doc ol')].map(o => o.getAttribute('start'))), [null, null, '0', '3', null, null]);

// a list that stops being numbered drops the number; copy and paste keep it
await load(pg, DOC); await openAt('#c li'); await type('8'); await K.press('Enter'); await sleep(80);
await caretIn(pg, '#c li'); await click(pg, 'ul'); await sleep(120);
check('made into a bullet list, the number goes', await pg.evaluate(() => !document.querySelector('#doc [start]')), await pg.evaluate(() => document.getElementById('doc').innerHTML.slice(-400)));
const paste = (h) => pg.evaluate((h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', 'x'); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h);
await load(pg, DOC); await caretIn(pg, '#p'); await paste('<ol start="5" style="color:red" type="a"><li>five</li><li>six</li></ol><p>x</p><ol start="1"><li>one</li></ol>'); await sleep(100);
same('a list pasted from another program keeps its start number and nothing else', await pg.evaluate(() => [...document.querySelectorAll('#doc ol')].filter(o => /five|one/.test(o.textContent) && !o.id).map(o => o.outerHTML.match(/<ol[^>]*>/)[0])), ['<ol start="5">', '<ol>']);
await load(pg, DOC); await caretIn(pg, '#p'); await paste('<div data-fle-clip="1"><ol start="7"><li>seven</li></ol></div>'); await sleep(100);
check('and so does a list copied in the editor', await pg.evaluate(() => !!document.querySelector('#doc ol[start="7"]')));

// repeat
await load(pg, DOC); await openAt('#b1'); await K.press('Enter'); await sleep(80); await caretIn(pg, '#c li'); await click(pg, 'repeat'); await sleep(80);
same('Repeat sets the same number on another list', [(await start('#b'))[0], (await start('#c'))[0]], ['4', '4']);
check('Repeat names the number', await pg.evaluate(() => document.querySelector('[data-a="repeat"]').title.includes('Start numbering at 4')));
// inspector
await caretIn(pg, '#c li'); await sleep(60); await click(pg, 'inspect'); await sleep(120);
check('Inspect formatting says where the list starts', await pg.evaluate(() => document.querySelector('#insp').textContent.includes('Numbered list item, list starts at 4')), await pg.evaluate(() => (document.querySelector('#insp') || {}).textContent));
check('the toolbar is still one row with Help at the far right', await pg.evaluate(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return t.right - h.right < 20 && h.top - t.top < 20; }));
same('no page errors', errors, []);
await b.close();
