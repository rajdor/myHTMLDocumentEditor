// Undo and redo cover structural changes (Clear format, merges, Q&A, code blocks, tables) as well as typing;
// Enter at the end of a subtitle, caption or lead paragraph gives a plain paragraph; Clear format keeps status icons;
// opening a document never runs its scripts or event handlers; heading ids stay unique; a missing draft is ignored.
import { open, check, same, caretIn, caretCell, click, sleep, load } from './harness.mjs';
const { b, pg } = await open({ prompt: '2,2' });
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const html = () => pg.evaluate(() => document.getElementById('doc').innerHTML);
const key = async (k, shift) => { await K.down(mod); if (shift) await K.down('Shift'); await K.press(k); if (shift) await K.up('Shift'); await K.up(mod); await sleep(80); };

await load(pg, '<main><p>alpha <b>bold</b></p><p>beta</p></main>');
await caretIn(pg, '#doc p'); await click(pg, 'clear'); await sleep(50);
same('Clear format applied', await html(), '<p>alpha bold</p><p>beta</p>');
await key('z'); same('Ctrl+Z undoes Clear format', await html(), '<p>alpha <b>bold</b></p><p>beta</p>');
await key('z', true); same('Ctrl+Shift+Z redoes it', await html(), '<p>alpha bold</p><p>beta</p>');
await click(pg, 'undo'); await sleep(50); same('Undo button undoes it', await html(), '<p>alpha <b>bold</b></p><p>beta</p>');
await click(pg, 'redo'); await sleep(50); same('Redo button redoes it', await html(), '<p>alpha bold</p><p>beta</p>');

await load(pg, '<main><p>x</p></main>'); await caretIn(pg, '#doc p'); await click(pg, 'table'); await sleep(50);
await caretCell(pg, 0, 1, 0); await K.type('c1'); await click(pg, 'mr'); await sleep(50);
check('merged', (await html()).includes('<td colspan="2">c1</td>'));
await key('z'); check('undo restores the unmerged cells', (await html()).includes('<td>c1</td><td><br></td>'));
await key('z'); same('undo again removes the typing and the table', await html(), '<p>x</p>');

await load(pg, '<main><p>x</p></main>'); await caretIn(pg, '#doc p'); await click(pg, 'qa'); await K.type('Q'); await K.press('Enter'); await K.type('A'); await sleep(500);
await key('z'); check('undo steps back through a Q&A list', !(await html()).includes('>A</dd>'));

await load(pg, '<main><h1>T</h1><p class="sub">Sub</p><p class="cap">Cap</p></main>');
await caretIn(pg, '#doc p.sub'); await K.press('Enter'); await K.type('n1');
await caretIn(pg, '#doc p.cap'); await K.press('Enter'); await K.type('n2'); await sleep(50);
same('Enter after a subtitle or caption gives a plain paragraph', await pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(n => n.tagName + (n.className ? '.' + n.className : '') + ':' + n.textContent)),
  ['H1:T', 'P.sub:Sub', 'P:n1', 'P.cap:Cap', 'P:n2']);

await load(pg, '<main><table class="balls"><tr><td><b>a</b> <span class="wb-ball is-good"></span></td></tr></table></main>');
await caretIn(pg, '#doc td'); await click(pg, 'clear'); await sleep(50);
same('Clear format keeps status icons', await pg.evaluate(() => document.querySelector('#doc td').innerHTML), 'a <span class="wb-ball is-good"></span>');

await pg.evaluate(() => { window.__x = 0; });
await load(pg, '<main><h1>T</h1><img src="x" onerror="window.__x=1"><details open ontoggle="window.__x=2"><summary>s</summary></details><svg><animate onbegin="window.__x=3" attributeName="x" dur="1s"/></svg><a href="javascript:window.__x=4">j</a><iframe srcdoc="<script>parent.__x=5<\/script>"></iframe><object data="x"></object><div onfocus="window.__x=6" autofocus tabindex="1">f</div></main>');
await sleep(1200);
same('opening a document runs none of its scripts', await pg.evaluate(() => window.__x), 0);
same('no handlers, script links or frames remain', await pg.evaluate(() => [...document.querySelectorAll('#doc *')].filter(e => [...e.attributes].some(a => /^on/i.test(a.name) || /^\s*javascript:/i.test(a.value)) || /^(IFRAME|OBJECT|EMBED|SCRIPT)$/.test(e.tagName)).length), 0);

await load(pg, '<main><h2>Same</h2><h2>Same 2</h2><h2>Same</h2></main>');
const ids = await pg.evaluate(() => [...document.querySelectorAll('#doc h2')].map(h => h.id));
same('heading ids are unique', new Set(ids).size, 3);

await pg.evaluate(() => { localStorage.removeItem('fle-draft'); document.getElementById('draft').hidden = false; document.querySelector('[data-a="restore"]').click(); });
check('Restore with no draft leaves the document alone', (await html()).includes('Same'));
// a heading before the first H2 is listed, unnumbered
await load(pg, '<main><h1>T</h1><h3>Before</h3><h2>A</h2><h3>A1</h3></main>'); await pg.select('#s-index', '2'); await sleep(50);
same('heading before the first H2 is listed, unnumbered', await pg.evaluate(() => [...document.querySelectorAll('#idx > li')].map(li => li.className + ':' + li.firstChild.textContent)), ['u:Before', ':A']);

// typing undoes a word at a time
await load(pg, '<main><p>x</p></main>'); await caretIn(pg, '#doc p'); await K.type(' one two three');
await key('z'); same('Undo removes the last word', await html(), '<p>x one two</p>');
await key('z'); same('and then the one before', await html(), '<p>x one</p>');

// web images are not fetched; the status bar says so
await load(pg, '<main><p>x</p><img src="https://example.com/a.png"><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw="></main>');
check('status reports web images shown as a link card', /1 web item shown as a link card/.test(await pg.$eval('#status', s => s.textContent)), await pg.$eval('#status', s => s.textContent));
await b.close();
