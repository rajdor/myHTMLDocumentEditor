// The diagram editor's Size control changes selected text while a label is being edited, inside the document editor
// (myDiagramer BUG-001: clicking Size used to clear the selection, so nothing changed).
import { open, check, same, caretIn, click, sleep, waitFor } from './harness.mjs';
const { b, pg } = await open();
await caretIn(pg, '#doc p:last-child'); await click(pg, 'diagram');
let f; for (let i = 0; i < 60 && !f; i++) { await sleep(250); f = pg.frames().find(x => x.url() === 'about:srcdoc'); if (f) { try { if (!(await f.evaluate(() => !!(window.DiagramEditor && DiagramEditor.S.embed)))) f = null; } catch (e) { f = null; } } }
check('diagram editor open', !!f);
await f.evaluate(async () => { const D = DiagramEditor; await D.loadText('<mxfile><diagram name="P" id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" value="Hello world" style="rounded=0;whiteSpace=wrap;html=1;fontSize=12;" vertex="1" parent="1"><mxGeometry x="100" y="100" width="200" height="80" as="geometry"/></mxCell></root></mxGraphModel></diagram></mxfile>', 'x.drawio');
  const c = D.S.doc.pages[0].cells.find(x => x.value === 'Hello world'); D.setSel([c.id]); D.startEdit(c); });
await sleep(300);
await f.evaluate(() => { const t = document.querySelector('#htmlLayer .ed').firstChild, r = document.createRange(); r.setStart(t, 6); r.setEnd(t, 11); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
const size = await f.evaluateHandle(() => { const sec = [...document.querySelectorAll('.fsec')].find(x => /^Text/.test(x.textContent.trim())); return [...sec.querySelectorAll('.frow')].find(r => /^Size/.test(r.textContent)).querySelector('input[type=number]'); });
await size.click(); await size.evaluate(i => i.select()); await pg.keyboard.type('24'); await pg.keyboard.press('Enter'); await sleep(200);
same('only the selected word changes size', await f.evaluate(() => document.querySelector('#htmlLayer .ed').innerHTML), 'Hello <span style="font-size: 24px;">world</span>');
check('label still being edited', await f.evaluate(() => !!DiagramEditor.S.editing));
await f.evaluate(() => { DiagramEditor.finishEdit(); DiagramEditor.embedDone(); });
await waitFor(pg, () => document.getElementById('de-overlay').hidden);
check('the larger word reaches the document', await pg.evaluate(() => { const t = [...document.querySelectorAll('#doc .dg svg text, #doc .dg svg tspan')].find(n => n.textContent.trim() === 'world'); return !!t && /24/.test(t.getAttribute('font-size') || t.closest('[font-size]')?.getAttribute('font-size') || getComputedStyle(t).fontSize); }));
await b.close();
