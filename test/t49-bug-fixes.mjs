// Fixes from one round of reports: a copied diagram pastes where the cursor is, even after a click beside the page;
// with the diagram editor open nothing is pasted into the page behind it, and its Ctrl+V takes draw.io XML from the system
// clipboard, so shapes copied in one diagram paste into another; Done with nothing changed leaves the page unchanged;
// blank space beside a lone picture or diagram can be clicked to write before and after it.
import { open, load, check, same, sleep, waitFor } from './harness.mjs';
const { b, pg, errors } = await open();
const ctx = b.defaultBrowserContext(); try { await ctx.overridePermissions('file://', ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']); } catch (e) { }
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 80" width="200" height="80"><rect x="5" y="5" width="190" height="70" fill="#eee" stroke="#333"/><text x="100" y="45" text-anchor="middle">Box</text></svg>';
const order = () => pg.evaluate(() => [...document.querySelectorAll('#doc > *')].map(e => e.matches('.dg') ? 'DG' : e.matches('svg') ? 'SVG' : e.tagName + (e.textContent.trim() ? ':' + e.textContent.trim().slice(0, 12) : '')));
const key = async (k) => { await pg.keyboard.down('Control'); await pg.keyboard.press(k); await pg.keyboard.up('Control'); await sleep(250); };
const centre = (sel) => pg.evaluate((s) => { const e = document.querySelector(s); e.scrollIntoView({ block: 'center', behavior: 'instant' }); const r = e.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel);
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc');
async function editor() { for (let i = 0; i < 80; i++) { const f = frame(); if (f) { try { if (await f.evaluate(() => !!window.DiagramEditor && !!DiagramEditor.S.embed && document.body.classList.contains('embed'))) return f; } catch (e) { } } await sleep(250); } return null; }
const closed = () => waitFor(pg, () => document.getElementById('de-overlay').hidden);
const dirty = () => pg.evaluate(() => document.querySelector('[data-a="save"]').classList.contains('has'));
async function putText(t) { await pg.evaluate((x) => { const a = document.createElement('textarea'); a.id = 'tmpclip'; a.value = x; document.body.appendChild(a); a.focus(); a.select(); }, t); await key('c'); await pg.evaluate(() => document.getElementById('tmpclip').remove()); }

/* ----- a copied diagram pastes at the cursor ----- */
const DOC = '<main><h1>T</h1><h2>First</h2><p>Alpha</p><div class="dg" data-drawio="">' + SVG + '</div><p class="cap">Figure. One</p><h2>Second</h2><p>Bravo</p></main>';
await load(pg, DOC);
let [x, y] = await centre('#doc p:not(.cap)'); await pg.mouse.click(x, y); await sleep(80);   // the cursor was in Alpha
[x, y] = await centre('#doc .dg'); await pg.mouse.click(x, y); await sleep(80); await key('c');
const h2 = await pg.evaluate(() => { const h = document.querySelectorAll('#doc h2')[1], r = document.createRange(); r.selectNodeContents(h); const t = r.getBoundingClientRect(); return [t.right + 60, t.y + t.height / 2]; });
await pg.mouse.click(h2[0], h2[1]); await sleep(80); await key('v');
same('a diagram copied, then pasted in the blank space after a heading, goes after that heading', await order(), ['H1:T', 'H2:First', 'P:Alpha', 'DG', 'P:Figure. One', 'H2:Second', 'DG', 'P:Bravo']);
check('and the diagram is no longer selected after the click', await pg.evaluate(() => !document.querySelector('.ed-dsel')));
await load(pg, DOC);
[x, y] = await centre('#doc .dg'); await pg.mouse.click(x, y); await sleep(80);
await pg.mouse.click(1435, 300); await sleep(80);
check('a click beside the page also ends the diagram selection', await pg.evaluate(() => !document.querySelector('.ed-dsel')));

/* ----- the diagram editor open: Ctrl+V goes into the diagram, never into the page ----- */
const XML = '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Counter" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="144" height="64" as="geometry"/></mxCell><mxCell id="b" value="Kitchen" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="280" y="40" width="144" height="64" as="geometry"/></mxCell></root></mxGraphModel>';
await load(pg, '<main><h1>T</h1><p id="a">Alpha</p><p id="b">Bravo</p></main>');
await putText(XML);
[x, y] = await centre('#b'); await pg.mouse.click(x, y); await sleep(80);
await pg.click('#chrome button[data-a="diagram"]'); let f = await editor(); await sleep(300);
check('the diagram editor opens', !!f);
check('the keys go to the diagram editor as it opens', await pg.evaluate(() => document.activeElement && document.activeElement.id === 'de-frame') && await f.evaluate(() => document.hasFocus()));
await key('v'); await sleep(300);
same('Ctrl+V with draw.io XML on the clipboard adds the shapes to the diagram', await f.evaluate(() => DiagramEditor.S.doc.pages[0].cells.filter(c => !c.e).length), 2);
check('and nothing goes into the page behind it', await pg.evaluate(() => !/mxGraphModel|mxCell/.test(document.getElementById('doc').innerHTML)));
await pg.evaluate(() => document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: (() => { const d = new DataTransfer(); d.setData('text/plain', 'stray'); return d; })() })));
check('a paste that reaches the page while the diagram editor is open is refused', await pg.evaluate(() => !/stray/.test(document.getElementById('doc').textContent)));
// copy both shapes, Done, then a new diagram: Ctrl+V brings them across
await f.evaluate(() => { DiagramEditor.runCommand('selectAll'); }); await sleep(100); await key('c');
await f.evaluate(() => DiagramEditor.embedDone()); await closed();
same('Done places the diagram and the page has no XML text', [await pg.evaluate(() => document.querySelectorAll('#doc .dg').length), await pg.evaluate(() => /mxCell/.test(document.getElementById('doc').textContent))], [1, false]);
check('Ctrl+C in the diagram editor puts the shapes on the system clipboard as draw.io XML', /<mxCell[^>]*value="Counter"/.test(await pg.evaluate(() => navigator.clipboard.readText())));
await load(pg, '<main><h1>Other</h1><p id="z">Zulu</p></main>', 'other.html');
[x, y] = await centre('#z'); await pg.mouse.click(x, y); await sleep(80);
await pg.click('#chrome button[data-a="diagram"]'); f = await editor(); await sleep(300);
await key('v'); await sleep(400);
same('in another document, a new diagram takes the shapes copied from the first', await f.evaluate(() => DiagramEditor.S.doc.pages[0].cells.filter(c => !c.e).map(c => c.value).sort()), ['Counter', 'Kitchen']);
await pg.evaluate(async (x) => { await navigator.clipboard.writeText(x); }, XML.replace(/Counter/, 'Till').replace(/Kitchen/, 'Back room'));
await key('v'); await sleep(400);
same('and draw.io XML copied anywhere else pastes in as shapes too', await f.evaluate(() => DiagramEditor.S.doc.pages[0].cells.filter(c => !c.e).map(c => c.value).sort()), ['Back room', 'Counter', 'Kitchen', 'Till']);
await f.evaluate(() => DiagramEditor.embedCancel()); await sleep(300);
if (!(await pg.evaluate(() => document.getElementById('de-overlay').hidden))) { await f.evaluate(() => { const b = [...document.querySelectorAll('#modalRoot button')].find(x => /Discard/.test(x.textContent)); if (b) b.click(); }); await closed(); }

/* ----- Done with nothing changed ----- */
await pg.evaluate(async () => { const r = await new Promise(res => { const h = (e) => { if (e.data && e.data.type === 'de:rendered') { removeEventListener('message', h); res(e.data); } }; addEventListener('message', h); FLE.DE.frame.contentWindow.postMessage({ type: 'de:render', xml: '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Kept" style="rounded=1;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="144" height="64" as="geometry"/></mxCell></root></mxGraphModel>', title: 'Kept', id: 'k1' }, '*'); });
  window.__dg = '<div class="dg" data-drawio="' + r.xml.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '">' + r.svg + '</div>'; });
await load(pg, await pg.evaluate(() => '<main><h1>Kept</h1><p>One</p>' + window.__dg + '<p class="cap">Figure. Kept</p><p>Two</p></main>'), 'kept.html');
const before = await pg.evaluate(() => document.querySelector('#doc .dg').outerHTML);
await pg.evaluate(() => document.querySelector('#doc .dg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); f = await editor(); await sleep(600);
await f.evaluate(() => DiagramEditor.embedDone()); await closed(); await sleep(200);
check('Done with nothing changed leaves the page unchanged and not marked as changed', !(await dirty()) && await pg.evaluate((b) => document.querySelector('#doc .dg').outerHTML.replace(/ ed-dsel/, '') === b, before));
await pg.evaluate(() => document.querySelector('#doc .dg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); f = await editor(); await sleep(600);
await f.evaluate(() => { const S = DiagramEditor.S; DiagramEditor.runCommand('selectAll'); }); await sleep(100); await key('d'); await sleep(200);
await f.evaluate(() => DiagramEditor.embedDone()); await closed(); await sleep(200);
check('Done after a change still updates the diagram and marks the page changed', await dirty() && await pg.evaluate(() => (document.querySelector('#doc .dg').getAttribute('data-drawio').match(/value="Kept"/g) || []).length === 2));

/* ----- a page holding only a picture ----- */
await load(pg, '<!DOCTYPE html><html><head><title>x</title></head><body>' + SVG + '</body></html>', 'pic.html');
const r = await pg.evaluate(() => { const s = document.querySelector('#doc svg').getBoundingClientRect(), d = document.getElementById('doc').getBoundingClientRect(); return { x: d.x + 60, above: s.top - 6, below: s.bottom + 40, top: d.top }; });
await pg.mouse.click(r.x, r.below); await sleep(100); await pg.keyboard.type('after'); await sleep(100);
same('a click below a lone picture gives a paragraph to type in after it', await order(), ['SVG', 'P:after']);
await load(pg, '<!DOCTYPE html><html><body><div class="dg" data-drawio="">' + SVG + '</div><table><tr><td>a</td></tr></table></body></html>', 'pic2.html');
const g = await pg.evaluate(() => { const a = document.querySelector('#doc .dg').getBoundingClientRect(), t = document.querySelector('#doc .tw, #doc table').getBoundingClientRect(), d = document.getElementById('doc').getBoundingClientRect(); return { x: d.x + 60, between: (a.bottom + t.top) / 2, above: a.top - 3, gap: t.top - a.bottom }; });
if (g.gap > 4) { await pg.mouse.click(g.x, g.between); await sleep(100); await pg.keyboard.type('middle'); await sleep(100); }
check('a click between a diagram and a table gives a paragraph between them', g.gap <= 4 || JSON.stringify(await order()) === JSON.stringify(['DG', 'P:middle', 'DIV']), [g, await order()]);
await load(pg, '<main><h1>T</h1><p>text</p></main>');
await pg.mouse.click(r.x, (await pg.evaluate(() => document.getElementById('doc').getBoundingClientRect().bottom)) - 10); await sleep(100);
same('beside text the click is left to the browser: no paragraph is added', await order(), ['H1:T', 'P:text']);
same('no page errors', errors, []);
await b.close();
