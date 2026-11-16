// The built-in diagram editor: Diagram opens it in an overlay, Done places an inline SVG plus the draw.io source in the
// document, double-click re-opens it with that source, Cancel changes nothing, ids stay unique across diagrams,
// and diagrams survive save and re-open.
import { open, check, same, caretIn, click, sleep, waitFor, ROOT } from './harness.mjs';
import path from 'path';
const { b, pg, dialogs } = await open();
const xml = (a, z) => '<mxfile><diagram name="Page-1" id="p1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="a" value="' + a + '" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="144" height="64" as="geometry"/></mxCell>' +
  '<mxCell id="b" value="' + z + '" style="rounded=0;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="280" y="40" width="144" height="64" as="geometry"/></mxCell>' +
  '<mxCell id="e" value="calls" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>' +
  '</root></mxGraphModel></diagram></mxfile>';
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc');
const overlay = () => pg.evaluate(() => !document.getElementById('de-overlay').hidden);
const closed = () => waitFor(pg, () => document.getElementById('de-overlay').hidden);
// want: text the loaded diagram must contain, or null for a new, empty diagram (the frame is reused, so wait for the new init)
async function waitEmbed(want) { for (let i = 0; i < 60; i++) { const f = frame(); if (f) { try { const ok = await f.evaluate((w) => { if (!window.DiagramEditor || !DiagramEditor.S.embed) return false; const cells = DiagramEditor.S.doc.pages[0].cells; return w ? cells.some(c => String(c.value).includes(w)) : cells.length === 0; }, want); if (ok) return f; } catch (e) { } } await sleep(250); } return null; }
async function draw(f, a, z) {
  await f.evaluate(async (x) => { await DiagramEditor.loadText(x, 'd.drawio'); DiagramEditor.setDiagramStyle('blueprint', { sizes: true, dots: true, shadows: true, whiteCanvas: true }); }, xml(a, z));
  await sleep(300); await f.evaluate(() => DiagramEditor.embedDone()); await closed();
}

// 1. new diagram
await caretIn(pg, '#doc p:last-child'); await click(pg, 'diagram');
check('overlay opens', await overlay());
let f = await waitEmbed(); check('diagram editor starts in embed mode', !!f);
same('new diagram starts in Blueprint', await f.evaluate(() => DiagramEditor.S.doc.mode), 'blueprint');
check('editor shows Done and Cancel', await f.evaluate(() => !!document.querySelector('#embedDone') && !!document.querySelector('#embedCancel')));
await draw(f, 'Alpha', 'Beta');
check('overlay closes on Done', !(await overlay()));
const d1 = await pg.evaluate(() => { const g = document.querySelector('#doc .dg'); const s = g && g.querySelector('svg'); return g && { svg: !!s, viewBox: !!(s && s.getAttribute('viewBox')), src: (g.getAttribute('data-drawio') || '').slice(0, 7), text: s.textContent, cap: g.nextElementSibling && g.nextElementSibling.className, ce: g.getAttribute('contenteditable'), fonts: /@font-face/.test(g.innerHTML) }; });
same('diagram placed with its source', d1 && [d1.svg, d1.viewBox, d1.src, d1.cap, d1.ce, d1.fonts], [true, true, '<mxfile', 'cap', 'false', false]);
check('diagram text is searchable text', d1 && d1.text.includes('Alpha') && d1.text.includes('calls'), d1 && d1.text);

// 2. second diagram, ids unique across the page
await caretIn(pg, '#doc p.cap'); await click(pg, 'diagram'); f = await waitEmbed(); await draw(f, 'Gamma', 'Delta');
same('two diagrams', await pg.evaluate(() => document.querySelectorAll('#doc .dg').length), 2);
const ids = await pg.evaluate(() => { const all = [...document.querySelectorAll('#doc .dg [id]')].map(n => n.id); return { n: all.length, unique: new Set(all).size }; });
check('every id unique across diagrams (' + ids.n + ' ids)', ids.n === ids.unique, ids);
check('references point inside their own diagram', await pg.evaluate(() => [...document.querySelectorAll('#doc .dg')].every(g => [...g.innerHTML.matchAll(/url\(#([^)]+)\)/g)].every(m => g.querySelector('[id="' + m[1] + '"]')))));

// 3. edit the first diagram: its source goes back to the editor
await pg.evaluate(() => document.querySelector('#doc .dg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Alpha'); check('double-click re-opens the diagram with its source', !!f);
await f.evaluate(() => { const D = DiagramEditor; D.mutate(() => { D.S.doc.pages[0].cells.find(c => c.value === 'Alpha').value = 'Alpha edited'; }); D.embedDone(); }); await closed();
check('edited diagram replaced in place', await pg.evaluate(() => { const g = document.querySelectorAll('#doc .dg'); return g.length === 2 && g[0].textContent.includes('Alpha edited') && g[1].textContent.includes('Gamma'); }));

// 4. Cancel leaves the document unchanged
const before = await pg.evaluate(() => FLE.build());
await pg.evaluate(() => document.querySelectorAll('#doc .dg')[1].dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Gamma'); await f.evaluate(() => DiagramEditor.embedCancel()); await closed();
check('Cancel closes the editor', !(await overlay()));
same('Cancel changes nothing', await pg.evaluate(() => FLE.build()), before);

// 5. save and re-open
const html = await pg.evaluate(() => FLE.build());
check('saved diagrams carry their source', (html.match(/data-drawio="&lt;mxfile/g) || []).length === 2);
check('saved diagrams have no editor state', !/ed-dsel|contenteditable/.test(html));
await pg.evaluate((t) => FLE.load(t, 'again.html'), html); await sleep(300);
same('re-opened document unchanged', await pg.evaluate(() => FLE.build()), html);
check('svg titles and styles survive re-opening', await pg.evaluate((n) => document.querySelectorAll('#doc .dg svg title').length >= 2, 2));
await pg.evaluate(() => document.querySelector('#doc .dg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Alpha edited'); check('diagram re-opens after the document is re-opened', !!f);
await f.evaluate(() => DiagramEditor.embedCancel()); await closed();

// 6. select and delete
await pg.click('#doc .dg'); check('click selects a diagram', await pg.evaluate(() => document.querySelector('#doc .dg').classList.contains('ed-dsel') && !document.getElementById('gbar').hidden));
await pg.keyboard.press('Delete'); await sleep(100);
same('Delete removes the selected diagram', await pg.evaluate(() => document.querySelectorAll('#doc .dg').length), 1);
await pg.evaluate(() => document.querySelector('#doc .dg').scrollIntoView());
await pg.screenshot({ path: path.join(ROOT, 'test', 'out', 't6-diagram.png') });
await b.close();
