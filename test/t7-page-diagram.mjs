// Diagrams drawn directly on the page (before the built-in diagram editor) open in the diagram editor: they are converted
// to draw.io with positions, states, line types and attached arrows kept; Done replaces them with an SVG diagram,
// Cancel leaves them as they were. They are no longer edited in place.
import { open, check, same, load, sleep, waitFor, file } from './harness.mjs';
const { b, pg } = await open();
await load(pg, '<main><h1>T</h1><div class="fig"><div class="wb-board" style="width: 960px; height: 600px" role="img" aria-label="Checkout: target state">' +
  '<svg class="wb-arrow is-planned" width="95" height="8" viewBox="0 0 95 8" style="left: 200px; top: 178px; width: 95px; height: 8px"><defs><marker id="h1" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z"/></marker></defs><path d="M 0 4 L 90 4" marker-end="url(#h1)"/></svg>' +
  '<div class="wb-title" style="left: 64px; top: 40px">Checkout</div>' +
  '<div class="wb-box is-external" style="left: 64px; top: 150px; width: 136px; height: 64px">Web app</div>' +
  '<div class="wb-box is-new" style="left: 296px; top: 150px; width: 136px; height: 64px">Payments</div>' +
  '<div class="wb-note" style="left: 500px; top: 300px">focus here</div></div></div><p class="cap">Figure 1. Checkout</p></main>');
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc');
async function editorWith(text) { for (let i = 0; i < 60; i++) { const f = frame(); if (f) { try { if (await f.evaluate((w) => !!(window.DiagramEditor && DiagramEditor.S.embed && DiagramEditor.S.doc.pages[0].cells.some(c => String(c.value).includes(w))), text)) return f; } catch (e) { } } await sleep(250); } return null; }

// no editing in place: clicking selects the whole diagram
const box = await pg.$('#doc .wb-box'); await box.click();
check('click selects the page diagram, without the page diagram toolbar', await pg.evaluate(() => document.querySelector('#doc .fig').classList.contains('ed-dsel') && document.getElementById('dbar').hidden));
const bb = await box.boundingBox(); await pg.mouse.move(bb.x + 20, bb.y + 20); await pg.mouse.down(); await pg.mouse.move(bb.x + 20, bb.y + 140, { steps: 5 }); await pg.mouse.up();
same('boxes cannot be dragged on the page', await pg.evaluate(() => document.querySelector('#doc .wb-box').style.top), '150px');

// double-click converts it and opens the diagram editor
await pg.evaluate(() => document.querySelector('#doc .fig').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
const f = await editorWith('Payments'); check('double-click opens the converted diagram in the diagram editor', !!f);
const m = await f.evaluate(() => { const c = DiagramEditor.S.doc.pages[0].cells, v = (t) => c.find(x => String(x.value).includes(t)); const e = c.find(x => x.e);
  return { title: v('Checkout').style.fontSize, ext: v('Web app').style.deState, neu: v('Payments').style.deState, note: v('focus').style.deNote,
    edge: e && [e.source === v('Web app').id, e.target === v('Payments').id, e.style.deLine], dots: c.some(x => x.style.deDots !== undefined), geo: [v('Payments').x, v('Payments').y, v('Payments').w] }; });
same('converted: text sizes, states, notes, line type, attachment, dots and geometry', m,
  { title: '38', ext: 'external', neu: 'new', note: 'annotation', edge: [true, true, 'planned'], dots: true, geo: [296, 150, 136] });

// Cancel keeps the page diagram
await f.evaluate(() => DiagramEditor.embedCancel()); await waitFor(pg, () => document.getElementById('de-overlay').hidden);
check('Cancel leaves the page diagram unchanged', await pg.evaluate(() => !!document.querySelector('#doc .fig .wb-board') && !document.querySelector('#doc .dg')));

// Done replaces it with an SVG diagram and keeps the caption
await pg.evaluate(() => document.querySelector('#doc .fig').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
const g = await editorWith('Payments'); await g.evaluate(() => DiagramEditor.embedDone()); await waitFor(pg, () => document.getElementById('de-overlay').hidden);
same('Done replaces the page diagram with an SVG diagram', await pg.evaluate(() => [document.querySelectorAll('#doc .fig').length, document.querySelectorAll('#doc .dg svg').length, document.querySelector('#doc .dg').nextElementSibling.textContent]), [0, 1, 'Figure 1. Checkout']);

// every page diagram in the older-format sample converts
await load(pg, file('legacy-document.html'));
const all = await pg.evaluate(() => [...document.querySelectorAll('#doc .wb-board')].map(b => { const x = FLE.boardToDrawio(b), d = new DOMParser().parseFromString(x, 'text/xml');
  return d.querySelector('parsererror') ? 'bad' : d.querySelectorAll('mxCell[vertex]').length + '/' + d.querySelectorAll('mxCell[edge]').length; }));
check('all 3 sample diagrams convert to valid draw.io, with their shapes and arrows', all.length === 3 && !all.includes('bad') && all.every(x => { const [v, e] = x.split('/').map(Number); return v >= 5 && e >= 2; }), all);
await b.close();
