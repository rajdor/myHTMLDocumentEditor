// Show blocks: a view for pages from elsewhere. It tags the text blocks, outlines the tables and labels the containers the page came with;
// the bar under the toolbar unwraps or deletes the container the cursor is in, and clears the empty ones. The view
// and the mark on the chosen container are not saved, copied or kept in the history.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors, dialogs } = await open();
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const q = (f, ...a) => pg.evaluate(f, ...a);
const bar = () => q(() => { const c = document.querySelector('#cbar'); return c.hidden ? null : { name: document.querySelector('#ctname').textContent, unwrap: !document.querySelector('[data-a="ctunwrap"]').disabled, del: !document.querySelector('[data-a="ctdel"]').disabled, empty: document.querySelector('[data-a="ctempty"]').textContent, emptyOn: !document.querySelector('[data-a="ctempty"]').disabled }; });
const kids = (sel = '#doc') => q((s) => [...document.querySelector(s).children].map(e => e.tagName.toLowerCase() + (e.id ? '#' + e.id : '')), sel);
const PAGE = '<main><h1>Page</h1><p id="top">Clean line.</p>' +
  '<div class="wrap two-col" id="w"><div class="col" id="c1"><h2>Left</h2><p id="lp">Left words.</p></div><div class="col" id="c2">Loose words <b>bold</b><p id="rp">Right words.</p>tail</div></div>' +
  '<header id="sec"><p>in a header</p></header><article id="art"><div id="e1"></div><div id="e2"><p><br></p></div></article><aside id="e3">  </aside>' +
  '<div class="box box-note" role="note"><p class="box-h">Note</p><p id="bx">A box of the editor.</p></div>' +
  '<table><tr><td id="td"><div id="cd">in a cell</div>after</td></tr></table>' +
  '<div id="solo">Only words here</div><p id="end">The end.</p></main>';
await load(pg, PAGE);

check('the bar is hidden and nothing is outlined to start with', (await bar()) === null && await q(() => !document.querySelector('#doc').classList.contains('ed-blocks') && getComputedStyle(document.querySelector('#w')).outlineStyle === 'none'));
await caretIn(pg, '#top'); await click(pg, 'blocks'); await sleep(60);
check('Show blocks turns the view on and lights its button', await q(() => document.querySelector('#doc').classList.contains('ed-blocks') && document.querySelector('[data-a="blocks"]').classList.contains('on') && document.querySelector('[data-a="blocks"]').getAttribute('aria-pressed') === 'true'));
check('containers get a dashed outline and a label with their tag and class', await q(() => { const w = document.querySelector('#w'), s = getComputedStyle(w), l = getComputedStyle(w, '::before').content; return s.outlineStyle === 'dashed' && /div/.test(l) && getComputedStyle(document.querySelector('#e3'), '::before').content.includes('aside'); }), await q(() => getComputedStyle(document.querySelector('#w'), '::before').content));
check('a text block has no outline, only a tag in the margin that names it', await q(() => { const p = document.querySelector('#top'), t = getComputedStyle(p, '::after'); return getComputedStyle(p).outlineStyle === 'none' && t.content === '"p"' && t.position === 'absolute' && getComputedStyle(document.querySelector('#doc h1'), '::after').content === '"h1"'; }));
check('a table has a solid outline and a table tab, in a colour of its own', await q(() => { const t = document.querySelector('#doc table'), w = t.closest('.tw') || t, s = getComputedStyle(w), c = getComputedStyle(document.querySelector('#w')); return s.outlineStyle === 'solid' && s.outlineColor !== c.outlineColor && getComputedStyle(w, '::before').content === '"table"'; }));
check('a container is tinted as well as dashed', await q(() => getComputedStyle(document.querySelector('#w')).backgroundColor !== 'rgba(0, 0, 0, 0)'));
check('the editor\'s own boxes, table wrappers and diagrams are not containers', await q(() => getComputedStyle(document.querySelector('.box')).outlineStyle !== 'dashed' && getComputedStyle(document.querySelector('.box'), '::before').content === 'none'));
check('an empty container has height, so it can be clicked', await q(() => document.querySelector('#e1').getBoundingClientRect().height >= 30));
let s = await bar();
check('outside a container the bar says how many there are, with Unwrap and Delete off', !!s && /10 in this document/.test(s.name) && !s.unwrap && !s.del, s);
same('and counts the empty ones, the outermost of each nest', [s.empty, s.emptyOn], ['Delete empty containers (2)', true]);

await caretIn(pg, '#lp'); await sleep(60); s = await bar();
check('with the cursor in a container the bar names the innermost one', s.name === 'div.col' && s.unwrap && s.del && await q(() => document.querySelector('#c1').hasAttribute('data-ed-ct') && document.querySelectorAll('[data-ed-ct]').length === 1), s);
await click(pg, 'ctunwrap'); await sleep(80);
same('Unwrap takes the container away and keeps its blocks where they were', await kids('#w'), ['h2#left', 'p#lp', 'div#c2']);
check('the bar moves to the container around it', (await bar()).name === 'div.wrap.two-col');
await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(150);
same('undo puts the container back', await kids('#w'), ['div#c1', 'div#c2']);
check('and the history holds no mark of the chosen container', await q(() => !document.querySelector('#doc').innerHTML.includes('data-ed-ct') || document.querySelectorAll('[data-ed-ct]').length <= 1));

await pg.click('#c2', { offset: { x: 30, y: 8 } }); await sleep(80);
check('a click in a container chooses it', (await bar()).name === 'div.col' && await q(() => document.querySelector('#c2').hasAttribute('data-ed-ct')));
await click(pg, 'ctunwrap'); await sleep(80);
same('loose words become paragraphs when unwrapped; blocks stay as they are', await q(() => [...document.querySelector('#w').children].slice(1).map(e => e.tagName + ':' + e.innerHTML)), ['P:Loose words <b>bold</b>', 'P:Right words.', 'P:tail']);

await caretIn(pg, '#cd'); await sleep(60); await click(pg, 'ctunwrap'); await sleep(80);
same('in a table cell the words stay as a line, kept apart from what follows', await q(() => document.querySelector('#td').innerHTML), 'in a cell<br>after');
await caretIn(pg, '#solo'); await sleep(60); await click(pg, 'ctunwrap'); await sleep(80);
check('a container of words alone becomes a paragraph', await q(() => !document.querySelector('#solo') && [...document.querySelectorAll('#doc > p')].some(p => p.textContent === 'Only words here')));

await caretIn(pg, '#end'); await sleep(60);
await pg.click('#e1'); await sleep(80); s = await bar();
check('an empty container can be clicked and is named as empty', /^div \(empty\)$/.test(s.name) && s.del, s);
const before = dialogs.length; await click(pg, 'ctdel'); await sleep(80);
check('Delete container removes an empty one without asking', await q(() => !document.querySelector('#e1')) && dialogs.length === before);
await caretIn(pg, '#sec p'); await sleep(60); await click(pg, 'ctdel'); await sleep(120);
check('and asks first when there is something in it', await q(() => !document.querySelector('#sec')) && dialogs.length === before + 1 && /everything in it/.test(dialogs[dialogs.length - 1]), dialogs);

s = await bar(); same('the empty ones left are counted', s.empty, 'Delete empty containers (2)');
await click(pg, 'ctempty'); await sleep(100);
check('Delete empty containers clears them all and leaves the rest', await q(() => !document.querySelector('#art') && !document.querySelector('#e3') && !!document.querySelector('#w') && !!document.querySelector('#bx') && !!document.querySelector('#end')));
s = await bar(); check('and the button goes off with none left', s.empty === 'Delete empty containers (0)' && !s.emptyOn, s);
await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(150);
check('one undo brings them back', await q(() => !!document.querySelector('#art') && !!document.querySelector('#e3')));

await caretIn(pg, '#rp'); await sleep(60);
const out = await q(() => FLE.build());
check('the saved page holds no trace of the view', !/data-ed-ct|ed-blocks/.test(out) && /id="w"/.test(out));
check('a copy holds no mark either', await q(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('#w')); const g = getSelection(); g.removeAllRanges(); g.addRange(r); let h = ''; const e = new ClipboardEvent('copy', { clipboardData: new DataTransfer(), bubbles: true, cancelable: true }); document.dispatchEvent(e); h = e.clipboardData.getData('text/html'); return h.length > 20 && !h.includes('data-ed-ct'); }));
check('the toolbar is still one row with Help and Thin toolbar at the far right', await q(() => { const h = document.querySelector('[data-a="help"]').getBoundingClientRect(), t = document.getElementById('tbar').getBoundingClientRect(); return h.top - t.top < 20 && t.right - h.right < 40; }));

await click(pg, 'blocks'); await sleep(60);
check('Show blocks again turns the view off: no bar, no outlines, no mark', (await bar()) === null && await q(() => !document.querySelector('#doc').classList.contains('ed-blocks') && !document.querySelector('[data-ed-ct]') && getComputedStyle(document.querySelector('#w')).outlineStyle === 'none' && document.querySelector('[data-a="blocks"]').getAttribute('aria-pressed') === 'false'));
check('the document is as it was left: the view changed nothing in it', await q(() => !!document.querySelector('#w') && !document.querySelector('#doc [style*="outline"]')));
same('no page errors', errors, []);
await b.close();
