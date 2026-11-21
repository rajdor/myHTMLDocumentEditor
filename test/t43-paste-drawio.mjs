// Paste from draw.io XML, in the built-in diagram editor: with a diagram open from the document, the Edit menu command
// adds shapes written as draw.io XML elsewhere (an answer from an AI assistant, say), and Done places them in the
// document as an editable diagram. Open is blocked in the built-in editor, so this is the way in for such XML.
import { open, check, same, caretIn, click, sleep, waitFor } from './harness.mjs';
const { b, pg, errors } = await open();
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc');
const closed = () => waitFor(pg, () => document.getElementById('de-overlay').hidden);
async function waitEmbed() { for (let i = 0; i < 60; i++) { const f = frame(); if (f) { try { if (await f.evaluate(() => !!window.DiagramEditor && !!DiagramEditor.S.embed && DiagramEditor.S.doc.pages[0].cells.length === 0)) return f; } catch (e) { } } await sleep(250); } return null; }
const ANSWER = 'Here is the diagram as draw.io XML:\n\n```xml\n<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/>' +
  '<mxCell id="a" value="Counter" style="rounded=1;whiteSpace=wrap;html=1;fillColor=#DAE8FC;strokeColor=#6C8EBF;" vertex="1" parent="1"><mxGeometry x="40" y="40" width="144" height="64" as="geometry"/></mxCell>' +
  '<mxCell id="b" value="Kitchen" style="rounded=1;whiteSpace=wrap;html=1;" vertex="1" parent="1"><mxGeometry x="280" y="40" width="144" height="64" as="geometry"/></mxCell>' +
  '<mxCell id="e" value="sends order" style="edgeStyle=orthogonalEdgeStyle;html=1;" edge="1" parent="1" source="a" target="b"><mxGeometry relative="1" as="geometry"/></mxCell>' +
  '</root></mxGraphModel>\n```\n';
await caretIn(pg, '#doc p:last-child'); await click(pg, 'diagram');
const f = await waitEmbed(); check('the diagram editor opens from the document', !!f);
const items = await f.evaluate(() => { const m = [...document.querySelectorAll('#menus *')].find(e => e.textContent.trim() === 'Edit'); m.click(); const t = [...document.querySelectorAll('#menuPopup *')].filter(e => !e.children.length).map(e => e.textContent.trim()); m.click(); return t; });
check('its Edit menu holds Paste from draw.io XML (clipboard)', items.some(t => /^Paste from draw\.io XML \(clipboard\)/.test(t)), items);
await f.evaluate((x) => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.resolve(x), writeText: () => Promise.resolve() } }); DiagramEditor.runCommand('pasteXml'); }, ANSWER);
await sleep(500);
same('the command adds the shapes and the line from the clipboard text', await f.evaluate(() => { const c = DiagramEditor.S.doc.pages[0].cells; return [c.filter(x => !x.e && !x.isEdgeLabel).length, c.filter(x => x.e).length]; }), [2, 1]);
await f.evaluate(() => DiagramEditor.embedDone()); await closed();
const d = await pg.evaluate(() => { const g = document.querySelector('#doc .dg'); return g && { text: g.querySelector('svg').textContent, src: g.getAttribute('data-drawio') || '' }; });
check('Done places them in the document as a diagram, with its source', !!d && /Counter/.test(d.text) && /Kitchen/.test(d.text) && /sends order/.test(d.text) && /^<mxfile/.test(d.src) && /Counter/.test(d.src), d && d.text);

// with the clipboard closed to the page, the box to paste into does the same
await caretIn(pg, '#doc p:last-child'); await click(pg, 'diagram'); const f2 = await waitEmbed(); check('a second diagram opens empty', !!f2);
await f2.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: () => Promise.reject(new Error('denied')), writeText: () => Promise.resolve() } }); DiagramEditor.runCommand('pasteXml'); }); await sleep(400);
check('a box opens when the clipboard cannot be read', await f2.evaluate(() => !!document.querySelector('#pasteXmlText') && /did not let the editor read the clipboard/.test(document.querySelector('#pasteXmlWhy').textContent)));
await f2.evaluate((x) => { document.querySelector('#pasteXmlText').value = x; [...document.querySelectorAll('#modalRoot footer button')].find(e => e.textContent === 'Add to diagram').click(); }, ANSWER); await sleep(500);
same('XML pasted into the box is added and the box closes', await f2.evaluate(() => [DiagramEditor.S.doc.pages[0].cells.filter(x => !x.e && !x.isEdgeLabel).length, !!document.querySelector('#pasteXmlText')]), [2, false]);
await f2.evaluate(() => DiagramEditor.embedDone()); await closed();
same('and the document now holds two diagrams', await pg.evaluate(() => document.querySelectorAll('#doc .dg').length), 2);
check('the saved page holds both, with no script from the pasted text', await pg.evaluate(() => { const o = FLE.build(); return (o.match(/class="dg"/g) || []).length === 2 && !/```/.test(o); }));
same('no page errors', errors, []);
await b.close();
