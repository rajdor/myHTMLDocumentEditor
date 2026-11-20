// Diagrams drawn with HTML boxes (CSS grid and flexbox) in pages from elsewhere: each discrete diagram in a page is
// found and made into a diagram for the diagram editor when the page is opened; prose, tables and cards of running
// text are left alone; a bundled page is unpacked first, without running its scripts.
import { open, check, same, sleep, waitFor } from './harness.mjs';
const { b, pg, errors } = await open();
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc' && f !== pg.mainFrame());
const openPage = async (html) => { await pg.evaluate(async (t) => FLE.load(await FLE.withPictures(t), 'other.html'), html); await sleep(300); };
const dgs = () => pg.evaluate(() => [...document.querySelectorAll('#doc .dg')].map(g => { const d = new DOMParser().parseFromString(g.getAttribute('data-drawio'), 'text/xml'); return { svg: !!g.querySelector('svg'), text: g.querySelector('svg').textContent.replace(/\s+/g, ' '), cells: [...d.querySelectorAll('mxCell[vertex], mxCell[edge]')].map(c => ({ v: c.getAttribute('value') || '', s: c.getAttribute('style') || '', e: c.hasAttribute('edge'), w: +(c.querySelector('mxGeometry') || { getAttribute: () => 0 }).getAttribute('width'), x: +(c.querySelector('mxGeometry') || { getAttribute: () => 0 }).getAttribute('x'), y: +(c.querySelector('mxGeometry') || { getAttribute: () => 0 }).getAttribute('y') })) }; }));
const note = () => pg.evaluate(() => document.querySelector('#savedbar').hidden ? '' : document.querySelector('#savedmsg').textContent);

const CSS = '<style>.grid{display:grid;grid-template-columns:1fr 1fr;gap:10px;width:640px}.tier{border:1px solid #888780;border-radius:12px;background:#F1EFE8;padding:10px}.tier>h2{font-size:13px;margin:0 0 8px;text-align:center}.kl{background:#E1F5EE;border-color:#0F6E56}.row{display:flex;gap:8px}.box{flex:1 1 0;background:#fff;border:1px solid #888780;border-radius:8px;padding:8px;text-align:center}.box b{display:block;font-size:13px}.box span{display:block;font-size:11px;color:#5F5E5A}.side .box{border-style:dashed}.up{text-align:center;font-size:11px;color:#5F5E5A}.dot{display:inline-flex;width:24px;height:24px;border-radius:50%;border:1px solid #b8452f;align-items:center;justify-content:center;font-size:11px}.rule{border-top:2px dashed #cfc9bf;height:6px}.cap{text-transform:uppercase;font-size:11px}.cards{display:flex;gap:8px}.card{border:1px solid #999;padding:8px;flex:1}</style>';
const LONG = 'This card holds running text that goes on for a good while, well past what a label in a diagram would ever hold, so that it reads as prose and not as the name of a box in a picture of a system. '.repeat(2);
const PAGE = '<!doctype html><html><head><title>Layers</title>' + CSS + '</head><body><h1>Other page</h1><p id="intro">Some prose before the first diagram, long enough to be a paragraph.</p><h2>Serving layers</h2>' +
  '<div class="grid" id="d1"><div class="tier"><h2>Consumers</h2><div class="row"><div class="box"><b>Agents</b><span>Any runtime</span></div><div class="box"><b>Owners</b><span>Incidents, health</span></div></div></div>' +
  '<div class="tier kl"><h2>Knowledge layer</h2><div class="row"><div class="box"><b>Raw</b></div><span class="arrow">&#8594;</span><div class="box"><b>Register</b></div></div></div><div class="up">&#8593; Cited context</div><div class="side"><div class="box"><b>Identity</b><span class="dot">7</span></div></div></div>' +
  '<p id="mid">Prose between the two diagrams.</p><table id="tbl"><tr><td style="border:1px solid #000">a</td><td style="border:1px solid #000">b</td><td style="border:1px solid #000">c</td></tr></table>' +
  '<div id="d2" style="display:flex;gap:12px;width:500px"><div style="border:1px solid #333;padding:6px"><div class="cap">Sources</div></div><div style="background:#f3e6c4;padding:6px;border-radius:4px">Agent</div><div style="border:1px solid #333;padding:6px">Store<div class="rule"></div></div></div>' +
  '<div class="cards" id="cards"><div class="card">' + LONG + '</div><div class="card">' + LONG + '</div><div class="card">' + LONG + '</div></div><p id="end">The end.</p><script>document.title = "ran";</script></body></html>';
await openPage(PAGE);
let d = await dgs();
same('each discrete diagram in the page becomes a diagram', [d.length, d.every(x => x.svg)], [2, true]);
same('the line under the toolbar says so', await note(), '2 diagrams drawn with HTML boxes were made into editable diagrams. Double-click one to edit.');
same('prose, the table and cards of running text are left as they were; nothing ran', await pg.evaluate(() => [['#intro', '#mid', '#end', 'table', 'h1', 'h2'].map(s => document.querySelectorAll('#doc ' + s).length), /running text/.test(document.querySelector('#doc').textContent), document.title !== 'ran']), [[1, 1, 1, 1, 1, 1], true, true]);
check('the diagrams sit where the boxes were, in order', await pg.evaluate(() => { const k = [...document.querySelector('#doc').children], i = (s) => k.findIndex(e => e.matches(s)); const g = k.map((e, n) => e.matches('.dg') ? n : -1).filter(n => n >= 0); return i('#intro') < g[0] && g[0] < i('#mid') && i('#mid') < g[1] && g[1] < i('#end'); }));
const c1 = d[0].cells, lab = (v) => c1.find(c => c.v.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() === v);
check('boxes carry their words as labels, a heading line and a smaller line under it', !!lab('Agents Any runtime') && /font-size:11px/.test(lab('Agents Any runtime').v) && !!lab('Owners Incidents, health') && !!lab('Raw') && !!lab('Register'));
check('a box that holds other boxes keeps its own title as its label', !!lab('Consumers') && lab('Consumers').w > lab('Agents Any runtime').w * 2 && !!lab('Knowledge layer'));
check('colours, rounded corners and dashed borders come across', /fillColor=#E1F5EE/i.test(lab('Knowledge layer').s) && /strokeColor=#0F6E56/i.test(lab('Knowledge layer').s) && /arcSize=24/.test(lab('Consumers').s) && /dashed=1/.test(lab('Identity').s) && !/dashed=1/.test(lab('Raw').s));
check('a fully rounded box is an ellipse', c1.some(c => /^ellipse;/.test(c.s) && c.v === '7'));
check('words outside every box stay as text where they were', c1.some(c => /^text;/.test(c.s) && /Cited context/.test(c.v)));
check('an arrow written as a character between two boxes becomes a connector attached to both', c1.filter(c => c.e).length === 1 && /endArrow=block/.test(c1.find(c => c.e).s) && /exitX=1\.000/.test(c1.find(c => c.e).s) && /entryX=0\.000/.test(c1.find(c => c.e).s) && !c1.some(c => c.v === '\u2192'), c1.filter(c => c.e));
check('the picture shows the labels', /Agents/.test(d[0].text) && /Knowledge layer/.test(d[0].text));
const c2 = d[1].cells;
check('boxes styled on the element itself are read too, with capitals as shown', c2.some(c => c.v === 'SOURCES') && c2.some(c => c.v === 'Agent' && /fillColor=#F3E6C4/i.test(c.s) && /strokeColor=none/.test(c.s)));
check('a border on one side only is a line', c2.filter(c => c.e).length === 1 && /dashed=1/.test(c2.find(c => c.e).s));
await pg.evaluate(() => document.querySelector('#doc .dg').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
const cells = await waitFor(pg, () => true) && await (async () => { for (let i = 0; i < 60; i++) { const f = frame(); if (f) { try { const c = await f.evaluate(() => window.DiagramEditor && DiagramEditor.S.embed && DiagramEditor.S.doc.pages[0].cells.length ? { mode: DiagramEditor.S.doc.mode, n: DiagramEditor.S.doc.pages[0].cells.length } : null); if (c) return c; } catch (e) { } } await sleep(150); } return null; })();
check('a converted diagram opens in the diagram editor like any other', !!cells && cells.n >= 9 && cells.mode === 'outline', cells);
await frame().evaluate(() => DiagramEditor.embedCancel()); await waitFor(pg, () => document.getElementById('de-overlay').hidden);
check('the saved page holds the diagrams and no leftover boxes', await pg.evaluate(() => { const o = FLE.build(); return (o.match(/class="dg"/g) || []).length === 2 && !o.includes('class="tier"') && !/[^\x00-\x7F]/.test(o); }));

/* ----- a page that is all one diagram ----- */
await openPage('<!doctype html><html><head>' + CSS + '</head><body><div class="grid"><div class="box"><b>One</b></div><div class="box"><b>Two</b></div><div class="box"><b>Three</b></div></div></body></html>');
d = await dgs(); same('a page that is one diagram and nothing else', [d.length, d[0].cells.filter(c => !c.e).map(c => c.v).sort()], [1, ['One', 'Three', 'Two']]);

/* ----- nothing to convert ----- */
await openPage('<!doctype html><html><head>' + CSS + '</head><body><h1>Cards</h1><div class="cards"><div class="card">' + LONG + '</div><div class="card">' + LONG + '</div><div class="card">' + LONG + '</div></div><div class="row"><p>Two paragraphs laid side by side.</p><p>The second one.</p></div></body></html>');
same('cards of running text and laid-out prose are not diagrams', [(await dgs()).length, await note()], [0, '']);

/* ----- a bundled page: the content is text inside a script ----- */
const TPL = '<!DOCTYPE html><html><head><script src="abc"></scr' + 'ipt></head><body><x-dc><helmet><link rel="preconnect" href="https://fonts.example.com"></helmet><div style="width:700px;padding:20px;background:#f4f1eb"><div style="font-size:30px;font-weight:600">{{ title }}</div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div style="border:1px solid #a9cbc9;border-radius:8px;padding:10px;background:#fff">UI layer<sc-if value="{{ showBadges }}" hint-placeholder-val="{{ true }}"><span style="display:inline-flex;width:24px;height:24px;border-radius:50%;border:1px solid #b8452f;align-items:center;justify-content:center">16</span></sc-if></div><div style="border:1px solid #a9cbc9;padding:10px">Store<sc-if value="{{ hidden }}"><b>never shown</b></sc-if></div><div style="border:1px solid #a9cbc9;padding:10px">Agent</div></div></div></x-dc><script type="text/x-dc" data-dc-script="" data-props="{&quot;title&quot;:{&quot;default&quot;:&quot;System map&quot;},&quot;showBadges&quot;:{&quot;default&quot;:true},&quot;hidden&quot;:{&quot;default&quot;:false}}">class Component {}</scr' + 'ipt></body></html>';
const BUNDLE = '<!DOCTYPE html><html><head><title>Bundled Page</title></head><body><div id="__bundler_thumbnail"><svg viewBox="0 0 200 200"><rect width="200" height="200" fill="#1c6b73"></rect></svg></div><div id="__bundler_loading">Unpacking...</div><script>document.title = "ran";</scr' + 'ipt><script type="__bundler/manifest">{}</scr' + 'ipt><script type="__bundler/template">' + JSON.stringify(TPL).replace(/<\//g, '<\\/') + '</scr' + 'ipt></body></html>';
const un = await pg.evaluate((t) => FLE.unbundle(t), BUNDLE);
check('a bundled page is unpacked without its scripts, with its defaults filled in', /System map/.test(un) && !/\{\{/.test(un) && !/<script/i.test(un) && !/never shown/.test(un) && />16</.test(un) && !/Unpacking/.test(un), un.slice(0, 300));
await openPage(BUNDLE); d = await dgs();
check('and its diagram is converted', d.length === 1 && ['UI layer', 'Store', 'Agent', '16'].every(v => d[0].cells.some(c => c.v === v)) && d[0].cells.some(c => /^text;/.test(c.s) && c.v === 'System map') && await pg.evaluate(() => document.title !== 'ran'), d[0] && d[0].cells.map(c => c.v));
check('a page with no bundle comes back as it was', await pg.evaluate(() => FLE.unbundle('<p>x</p>') === '<p>x</p>'));
same('no page errors', errors, []);
await b.close();
