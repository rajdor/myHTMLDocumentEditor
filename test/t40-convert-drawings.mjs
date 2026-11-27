// Pictures and Mermaid definitions from other pages made into diagrams: a plain SVG picture styled by the page's style
// sheet keeps its look when opened and converts to shapes with attached lines; a sketch-style picture converts in the
// Sketch style; a Mermaid flowchart is parsed and laid out; Cancel and anything not recognised leave the page as it was.
import { open, check, same, load, sleep, waitFor, caretIn } from './harness.mjs';
const { b, pg, errors, dialogs } = await open();
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc');
const closed = () => waitFor(pg, () => document.getElementById('de-overlay').hidden);
// the diagram the editor holds, once it is a new one: each one read is marked, so a slow machine is not read the one before
const cells = async () => { for (let i = 0; i < 80; i++) { const f = frame(); if (f) { try { const c = await f.evaluate(() => window.DiagramEditor && DiagramEditor.S.embed && !DiagramEditor.S.doc.__read && DiagramEditor.S.doc.pages[0].cells.length ? { mode: DiagramEditor.S.doc.mode, cells: DiagramEditor.S.doc.pages[0].cells.map(c => ({ v: String(c.value || ''), e: !!c.e, s: !!c.source, t: !!c.target, style: Object.keys(c.style).filter(k => ['ellipse', 'rhombus', 'sketch', 'dashed', 'curved'].includes(k)).join(','), fill: c.style.fillColor, end: c.style.endArrow })) } : null); if (c) { await f.evaluate(() => { DiagramEditor.S.doc.__read = true; }); return c; } } catch (e) { } } await sleep(150); } return null; };
const done = async () => { await sleep(300); await frame().evaluate(() => DiagramEditor.embedDone()); await closed(); await sleep(150); };
const cancel = async () => { await sleep(300); await frame().evaluate(() => DiagramEditor.embedCancel()); await closed(); await sleep(150); };
const bar = () => pg.evaluate(() => { const g = document.querySelector('#gbar'); return g.hidden ? null : [g.querySelector('b').textContent, ...[...g.querySelectorAll('button')].filter(x => !x.hidden).map(x => x.textContent)]; });
// the diagram editor's notice bar: its text, or null when hidden
const notice = () => frame().evaluate(() => { const n = document.querySelector('#embedNotice'); return !n || n.hidden ? null : n.querySelector('span').textContent; });
const count = (sel) => pg.evaluate((sel) => document.querySelectorAll(sel).length, sel);
const openPage = async (html) => { await pg.evaluate(async (t) => FLE.load(await FLE.withPictures(t), 'other.html'), html); await sleep(300); };

/* ----- a plain SVG picture whose look comes from the page's style sheet ----- */
const PLAIN = '<!doctype html><html><head><style>.bx{fill:#EEEDFE;stroke:#534AB7;stroke-width:1.5}.ln{fill:none;stroke:#888780;stroke-width:1.5}.t{font:600 14px sans-serif;fill:#26215C;text-anchor:middle}.d{stroke-dasharray:4 3}</style></head><body><h1>Other page</h1><p>Text</p>' +
  '<svg id="plain" viewBox="0 0 520 220" role="img"><title>Parts: how they join</title><defs><marker id="a" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M2 1L8 5L2 9" fill="none" stroke="#888780"/></marker></defs>' +
  '<path class="ln" d="M160 50H300" marker-end="url(#a)"/><path class="ln d" d="M100 72V140H300"/><rect class="bx" x="40" y="28" width="120" height="44" rx="8"/><text class="t" x="100" y="55">Alpha</text><rect class="bx" x="300" y="28" width="120" height="44" rx="8"/><text class="t" x="360" y="55">Beta</text>' +
  '<circle class="bx" cx="340" cy="140" r="40"/><text class="t" x="340" y="145">Gamma</text><polygon class="bx" points="460,110 500,140 460,170 420,140"/><text class="t" x="230" y="200">a note under it all</text></svg><script>document.title = "ran";</script></body></html>';
await openPage(PLAIN);
const look = await pg.evaluate(() => { const r = document.querySelector('#doc svg rect'), s = getComputedStyle(r), p = getComputedStyle(document.querySelector('#doc svg path.ln')); return [s.fill, s.stroke, p.fill, p.stroke, document.title]; });
same('a picture styled by its page keeps its colours when opened, and the page script did not run', look.slice(0, 4).concat(look[4] !== 'ran'), ['rgb(238, 237, 254)', 'rgb(83, 74, 183)', 'none', 'rgb(136, 135, 128)', true]);
check('no bar until a picture is selected', await bar() === null);
await pg.click('#doc svg rect'); await sleep(100);
same('clicking the picture selects it and offers the conversion', await bar(), ['Picture', 'Convert to editable diagram', 'Copy', 'Cut', 'Delete picture']);
await pg.click('[data-a="dgconv"]');
let c = await cells();
check('the diagram editor opens with the picture as shapes, lines and text', !!c && c.mode === 'outline', c);
same('boxes and the circle carry their text as labels; the diamond is a diamond', c.cells.filter(x => !x.e).map(x => [x.v, x.style]), [['Alpha', ''], ['Beta', ''], ['Gamma', 'ellipse'], ['', 'rhombus'], ['a note under it all', '']]);
same('colours come across', c.cells.find(x => x.v === 'Alpha').fill.toUpperCase(), '#EEEDFE');
const pn = await notice();
check('the diagram editor says it was converted from a picture, that the look may differ, and what was recognised', /^Converted from a picture\. Layout and text formatting may differ from the original\. The page is unchanged until you click Done; Cancel keeps the picture\. \(4 shapes and 2 lines recognised(, \d+ parts? skipped)?\)$/.test(pn || ''), pn);
const ln = c.cells.filter(x => x.e);
check('the arrow is attached to both boxes and keeps its head', ln.length === 2 && ln[0].s && ln[0].t && ln[0].end === 'block', ln);
check('the elbow line is attached at both ends, dashed, with no head', ln[1].s && ln[1].t && ln[1].style.includes('dashed') && ln[1].end === 'none', ln);
await cancel();
same('Cancel leaves the page as it was', [await count('#doc svg#plain'), await count('#doc .dg')], [1, 0]);
await pg.evaluate(() => document.querySelector('#doc svg rect').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); await cells(); await done();
same('Done puts the diagram where the picture was', [await count('#doc svg#plain'), await count('#doc .dg svg'), await pg.evaluate(() => /<mxfile/.test(document.querySelector('#doc .dg').getAttribute('data-drawio')))], [0, 1, true]);
check('the saved page holds the diagram and its source', await pg.evaluate(() => { const o = FLE.build(); return o.includes('class="dg"') && o.includes('data-drawio='); }));
await pg.evaluate(() => document.querySelector('#doc .dg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); c = await cells();
check('it opens again as the same diagram', !!c && c.cells.some(x => x.v === 'Gamma'));
check('a diagram that is already a diagram opens with no notice', await notice() === null); await cancel();

/* ----- a sketch-style picture: every shape is strokes ----- */
const two = (x1, y1, x2, y2) => [0, 1].map(k => 'M' + (x1 + k) + ' ' + (y1 + k) + ' C' + (x1 + (x2 - x1) / 3) + ' ' + (y1 + (y2 - y1) / 3 + k) + ', ' + (x1 + 2 * (x2 - x1) / 3) + ' ' + (y1 + 2 * (y2 - y1) / 3) + ', ' + (x2 - k) + ' ' + (y2 + k)).join(' ');
const sbox = (x, y, w, h, fill, stroke, t) => '<path d="M' + x + ' ' + y + ' L' + (x + w) + ' ' + y + ' L' + (x + w) + ' ' + (y + h) + ' L' + x + ' ' + (y + h) + '" stroke="none" stroke-width="0" fill="' + fill + '"/><path d="' + [two(x, y, x + w, y), two(x + w, y, x + w, y + h), two(x + w, y + h, x, y + h), two(x, y + h, x, y)].join(' ') + '" stroke="' + stroke + '" stroke-width="2" fill="none"/><text x="' + (x + w / 2) + '" y="' + (y + h / 2 + 6) + '" font-family="Architects Daughter" font-size="18" fill="' + stroke + '" text-anchor="middle">' + t + '</text>';
const SKETCH = '<!doctype html><html><body><h1>Sketch page</h1><svg id="sk" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 200" role="img" aria-label="Two steps: one then two"><rect width="520" height="200" rx="14" fill="#F6F8F8"/><line x1="24" y1="0" x2="24" y2="200" stroke="#E0E6E6" stroke-width="0.7"/>' +
  '<path d="' + two(180, 80, 320, 80) + '" stroke="#5B6673" stroke-width="1.8" fill="none"/><path d="' + two(308, 73, 320, 80) + '" stroke="#5B6673" stroke-width="2.2" fill="none"/><path d="' + two(308, 87, 320, 80) + '" stroke="#5B6673" stroke-width="2.2" fill="none"/>' +
  sbox(40, 50, 140, 60, '#D9E9E8', '#0F766E', 'One') + sbox(320, 50, 140, 60, '#D9E9E8', '#0F766E', 'Two') + '<path d="' + two(40, 150, 460, 150) + '" stroke="#2B3440" stroke-width="1.8" fill="none"/><path d="' + two(40, 140, 40, 150) + '" stroke="#2B3440" stroke-width="1.8" fill="none"/></svg></body></html>';
await openPage(SKETCH); await pg.click('#doc svg rect'); await waitFor(pg, () => !!document.querySelector('[data-a="dgconv"]')); await pg.click('[data-a="dgconv"]'); c = await cells();
check('a sketch picture opens in the Sketch style', !!c && c.mode === 'sketch', c && c.mode);
same('its boxes and labels are found, and the tint and grid are left out', c.cells.filter(x => !x.e).map(x => x.v), ['One', 'Two']);
const sl = c.cells.filter(x => x.e);
check('the arrow is attached to both boxes, head at the right end', sl[0].s && sl[0].t && sl[0].end === 'open', sl);
check('a tick square to a line is a line, not an arrowhead', sl.length === 3 && sl[1].end === 'none', sl);
await done(); same('Done replaces the sketch picture', [await count('#doc svg#sk'), await count('#doc .dg svg')], [0, 1]);

/* ----- a picture with nothing to convert ----- */
await openPage('<!doctype html><html><body><h1>Chart</h1><svg id="ch" viewBox="0 0 300 200"><path d="M10 180 L290 180" stroke="#333" fill="none"/><path d="M10 180 C100 20, 200 20, 290 100" stroke="#0a0" fill="none"/><text x="20" y="20">Trend</text></svg></body></html>');
dialogs.length = 0; await pg.click('#doc svg text'); await sleep(100); await pg.click('[data-a="dgconv"]'); await sleep(300);
check('a picture with no shapes says so and stays a picture', dialogs.length === 1 && /stays as a picture/.test(dialogs[0]) && await count('#doc svg#ch') === 1 && await pg.$eval('#de-overlay', e => e.hidden), dialogs);

/* ----- a data model picture: entities whose text is set out in rows and columns ----- */
const ent = (x, t, rows) => '<rect x="' + x + '" y="20" width="300" height="' + (60 + rows.length * 24) + '" rx="6" fill="#ffffff" stroke="#1E3A5F"/><rect x="' + x + '" y="20" width="300" height="40" rx="6" fill="#1E3A5F"/><text x="' + (x + 150) + '" y="45" font-size="15" font-weight="700" fill="#FFFFFF" text-anchor="middle">' + t + '</text>' +
  rows.map(([k, n, ty], i) => (k ? '<text x="' + (x + 10) + '" y="' + (84 + i * 24) + '" font-size="11" fill="#475569">' + k + '</text>' : '') + '<text x="' + (x + 60) + '" y="' + (84 + i * 24) + '" font-size="13" fill="#1E293B"' + (k === 'FK' ? ' font-style="italic"' : '') + '>' + n + '</text><text x="' + (x + 290) + '" y="' + (84 + i * 24) + '" font-size="11" fill="#94A3B8" text-anchor="end">' + ty + '</text>').join('');
await openPage('<!doctype html><html><body><h1>Model</h1><svg id="er" viewBox="0 0 720 220">' + ent(20, 'SOURCE_REGISTRATION', [['PK', 'registration_id', 'uuid'], ['', 'source_location', 'text'], ['FK', 'proposed_home_node_id', '→ NODE']]) + ent(400, 'PARTY', [['PK', 'party_id', 'uuid'], ['', 'name', 'text']]) + '<path d="M320 90H400" stroke="#334155" fill="none"/></svg></body></html>');
await pg.evaluate(() => document.querySelector('#doc svg#er rect').dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))); c = await cells();
const body = c && c.cells.find(x => /registration_id/.test(x.v)), head = c && c.cells.find(x => /SOURCE_REGISTRATION/.test(x.v));
check('an entity\'s rows become a table in its label, the title stays in its header band', !!body && /<table/.test(body.v) && !!head && head !== body && !/registration_id/.test(head.v), c && c.cells.map(x => x.v.slice(0, 60)));
const row = body ? await pg.evaluate((v) => [...new DOMParser().parseFromString(v, 'text/html').querySelectorAll('tr')[0].cells].map(td => [td.textContent, td.getAttribute('align') || 'left']), body.v) : null;
same('each row keeps key, name and type side by side, the type to the right', row, [['PK', 'left'], ['registration_id', 'left'], ['uuid', 'right']]);
check('each piece keeps its own look: the key grey, a foreign key italic', /<font color="#475569"[^>]*>PK<\/font>/i.test(body.v) && /<i>proposed_home_node_id<\/i>/.test(body.v), body && body.v);
const plainBox = await pg.evaluate(() => { const h = document.createElement('div'); h.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 120" width="300" height="120"><rect x="10" y="10" width="200" height="100" fill="#fff" stroke="#000"/><text x="20" y="40">One</text><text x="20" y="60">Two</text><text x="20" y="80">Three</text><text x="20" y="100">Four</text></svg>'; document.body.appendChild(h); try { return FLE.svgToDrawio(h.firstChild, true).xml; } finally { h.remove(); } });
check('text that is not in rows and columns stays line by line', !/&lt;table/.test(plainBox) && /One&lt;br&gt;Two/.test(plainBox), plainBox.slice(0, 300));
await cancel();

/* ----- a Mermaid flowchart definition ----- */
const MM = '%%{init: {"flowchart": {"curve": "basis"}}}%%\nflowchart TD\n  A[Decision needed] --> B{Owner can convene<br/>or outranks?}\n  B -- Yes --> C[Owner decides]\n  B -->|No| D([Escalate])\n  subgraph S1 [Follow up]\n    D -.-> E((Log)) & F[(Store)]\n  end\n  C ==> G[Done]:::good\n  classDef good fill:#E3F4EA,stroke:#1E6B45,color:#1E6B45\n  %% a comment\n  E --- G';
await openPage('<!doctype html><html><body><h1>Flow</h1><p id="p">Before</p><pre class="mermaid">' + MM.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</pre><pre class="mermaid">sequenceDiagram\n  A->>B: hello</pre><script src="https://example.com/mermaid.min.js"></script></body></html>');
await caretIn(pg, '#p'); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(100);
check('no bar with the cursor in ordinary text', await bar() === null);
await caretIn(pg, '#doc pre', false); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(100);
same('the cursor in a Mermaid definition offers the conversion', await bar(), ['Mermaid definition', 'Convert to editable diagram']);
await pg.click('[data-a="dgconv"]'); c = await cells();
check('the flowchart opens in the Blueprint style', !!c && c.mode === 'blueprint', c && c.mode);
const nodes = c.cells.filter(x => !x.e && x.v), mlinks = c.cells.filter(x => x.e);
same('every node with its text, line breaks kept', nodes.map(x => x.v).filter(v => v !== 'Yes' && v !== 'No').sort(), ['Decision needed', 'Done', 'Escalate', 'Follow up', 'Log', 'Owner can convene<br>or outranks?', 'Owner decides', 'Store'].sort());
check('the decision is a diamond and the circle an ellipse', nodes.find(x => /convene/.test(x.v)).style === 'rhombus' && nodes.find(x => x.v === 'Log').style === 'ellipse');
same('every link, attached at both ends', [mlinks.length, mlinks.every(x => x.s && x.t)], [7, true]);
same('link text in both spellings, as labels on the links', nodes.map(x => x.v).filter(v => v === 'Yes' || v === 'No').sort(), ['No', 'Yes']);
check('a dotted link is dashed and a plain line has no arrowhead', mlinks.filter(x => x.style.includes('dashed')).length === 2 && mlinks.filter(x => x.end === 'none').length === 1, mlinks);
same('colours from classDef', c.cells.find(x => x.v === 'Done').fill.toUpperCase(), '#E3F4EA');
const mn = await notice();
check('the diagram editor says it was converted from a Mermaid definition', /^Converted from a Mermaid definition\. .*Cancel keeps the definition\. \(\d+ shapes and 7 links recognised\)$/.test(mn || ''), mn);
await done();
same('Done puts the diagram where the definition was', [await count('#doc pre'), await count('#doc .dg svg')], [1, 1]);
dialogs.length = 0; await caretIn(pg, '#doc pre', false); await pg.evaluate(() => document.dispatchEvent(new Event('selectionchange'))); await sleep(100); await pg.click('[data-a="dgconv"]'); await sleep(300);
check('another kind of Mermaid diagram says it cannot be converted and stays as text', dialogs.length === 1 && /Only Mermaid flowcharts/.test(dialogs[0]) && /sequence diagram/.test(dialogs[0]) && await count('#doc pre') === 1, dialogs);

/* ----- layout and the rest of the syntax, read from the XML ----- */
const lay = await pg.evaluate(() => { const r = FLE.mermaidToDrawio('graph LR\n A --> B --> C\n A --> D; D --> C\n C --> A'), d = new DOMParser().parseFromString(r.xml, 'text/xml'), g = v => { const c = [...d.querySelectorAll('mxCell')].find(c => c.getAttribute('value') === v).querySelector('mxGeometry'); return [+c.getAttribute('x'), +c.getAttribute('y')]; }; return { A: g('A'), B: g('B'), C: g('C'), D: g('D'), links: d.querySelectorAll('mxCell[edge]').length }; });
check('left to right: each step is further right, and a link back does not change that', lay.A[0] < lay.B[0] && lay.B[0] < lay.C[0] && lay.D[0] === lay.B[0] && lay.D[1] !== lay.B[1] && lay.links === 5, lay);
const sub = await pg.evaluate(() => { const g = (src) => { const d = new DOMParser().parseFromString(FLE.mermaidToDrawio(src).xml, 'text/xml'), at = v => { const c = [...d.querySelectorAll('mxCell')].find(c => c.getAttribute('value') === v).querySelector('mxGeometry'); return [+c.getAttribute('x'), +c.getAttribute('y'), +c.getAttribute('width'), +c.getAttribute('height')]; }; return { S: at('Start'), P: at('P'), Q: at('Q'), E: at('End'), box: at('Steps') }; };
  return { own: g('flowchart TD\n Start --> Sub --> End\n subgraph Sub [Steps]\n  direction LR\n  P --> Q\n end'), tied: g('flowchart TD\n Start --> P\n Q --> End\n subgraph Sub [Steps]\n  direction LR\n  P --> Q\n end') }; });
check('a subgraph with its own direction is laid out that way, inside its box, in the flow of the chart', sub.own.P[1] === sub.own.Q[1] && sub.own.P[0] < sub.own.Q[0] && sub.own.S[1] < sub.own.P[1] && sub.own.E[1] > sub.own.P[1] && sub.own.box[0] < sub.own.P[0] && sub.own.box[0] + sub.own.box[2] > sub.own.Q[0] + sub.own.Q[2], sub.own);
check('when its members are linked to the outside it follows the chart, as Mermaid does', sub.tied.P[1] < sub.tied.Q[1] && sub.tied.S[1] < sub.tied.P[1], sub.tied);
check('a page made by the editor is not redrawn before opening', await pg.evaluate(async () => { const o = FLE.build(); return (await FLE.withPictures(o)) === o; }));
same('no page errors', errors, []);
await b.close();
