// The built-in Data Model Studio: Data model opens it in an overlay, Done places an inline SVG plus the model (.dms.json) in the
// document, double-click re-opens it with the whole model, Cancel changes nothing, nothing in the picture leaks styles or ids into
// the page, and data models survive save and re-open next to diagrams.
import { open, check, same, caretIn, click, sleep, waitFor, ROOT } from './harness.mjs';
import path from 'path';
const { b, pg } = await open();
const frame = () => pg.frames().find(f => f.url() === 'about:srcdoc');
const overlay = () => pg.evaluate(() => !document.getElementById('dm-overlay').hidden);
const closed = () => waitFor(pg, () => document.getElementById('dm-overlay').hidden);
// want: an entity name the loaded model must have, or null for a new, empty model (the frame is reused, so wait for the new init)
async function waitEmbed(want) {
  for (let i = 0; i < 80; i++) { const f = frame(); if (f) { try { const ok = await f.evaluate((w) => typeof EMBED !== 'undefined' && EMBED.on && EMBED.settled && (w ? M.entities.some(e => e.name === w) : M.entities.length === 0), want); if (ok) return f; } catch (e) { } } await sleep(100); }
  return null;
}
async function build(f, names) {
  await f.evaluate((ns) => {
    if (!document.getElementById('welcome').hidden) { pickMode('solo'); startFromWelcome(); }
    soloEdit(null, () => { let prev = null; for (const n of ns) { const e = ensureEntity(n, { status: 'confirmed' }); addAttr(e, n.toLowerCase() + 'Id', { identifier: true }); if (prev) addRel(prev.id, e.id, { fromCard: '1', toCard: '0..*', status: 'confirmed' }); prev = e; } });
  }, names);
  await sleep(500); await f.evaluate(() => embedDone()); await closed();
}

// 1. new data model
await caretIn(pg, '#doc p:last-child'); await click(pg, 'datamodel');
check('overlay opens', await overlay());
let f = await waitEmbed(null); check('Data Model Studio starts in embed mode', !!f);
const ui = await f.evaluate(() => ({ skin: document.documentElement.dataset.skin, done: !document.getElementById('bDone').hidden, save: getComputedStyle(document.getElementById('bSave')).display, claude: getComputedStyle(document.getElementById('mClaude')).display, welcome: !document.getElementById('welcome').hidden }));
same('embed mode: Material app, Done shown, Save and Claude-assisted hidden, straight to the canvas (Fly solo)', ui, { skin: 'material', done: true, save: 'none', claude: 'none', welcome: false });
await build(f, ['Customer', 'Order']);
check('overlay closes on Done', !(await overlay()));
const d1 = await pg.evaluate(() => { const g = document.querySelector('#doc .dg.dm'); const s = g && g.querySelector('svg'); let model = null; try { model = JSON.parse(g.getAttribute('data-dms')); } catch (e) { }
  return g && { svg: !!s, viewBox: !!(s && s.getAttribute('viewBox')), format: model && model.format, ents: model && model.models[0].entities.map(e => e.name), cap: g.nextElementSibling && g.nextElementSibling.className, ce: g.getAttribute('contenteditable'), style: !!g.querySelector('style'), ids: g.querySelectorAll('[id]').length, cls: g.querySelectorAll('svg [class]').length, text: g.textContent }; });
same('data model placed with its model', d1 && [d1.svg, d1.viewBox, d1.format, d1.ents, d1.cap, d1.ce], [true, true, 'data-model-studio', ['Customer', 'Order'], 'cap', 'false']);
same('picture carries no style block, ids or classes', d1 && [d1.style, d1.ids, d1.cls], [false, 0, 0]);
check('table names are searchable text', d1 && d1.text.includes('Customer') && d1.text.includes('customerId'), d1 && d1.text);
await pg.click('#doc .dg.dm'); await sleep(100);
same('selected data model shows its own bar', await pg.evaluate(() => [document.querySelector('#gbar b').textContent, document.querySelector('[data-a="dgedit"]').textContent]), ['Data model', 'Edit data model']);

// 2. edit: the whole model goes back
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Customer'); check('double-click re-opens the data model with its model', !!f);
check('re-opened model opens straight to the canvas', await f.evaluate(() => document.getElementById('welcome').hidden));
await f.evaluate(() => { soloEdit(null, () => { ensureEntity('Invoice', { status: 'confirmed' }); }); }); await sleep(300);
await f.evaluate(() => embedDone()); await closed();
check('edited data model replaced in place', await pg.evaluate(() => { const g = document.querySelectorAll('#doc .dg.dm'); return g.length === 1 && g[0].textContent.includes('Invoice') && JSON.parse(g[0].getAttribute('data-dms')).models[0].entities.length === 3; }));

// 3. Cancel leaves the document unchanged
const before = await pg.evaluate(() => FLE.build());
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice'); await f.evaluate(() => embedCancel()); await closed();
check('Cancel closes Data Model Studio', !(await overlay()));
same('Cancel changes nothing', await pg.evaluate(() => FLE.build()), before);
// Done with nothing changed changes nothing either
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice'); await f.evaluate(() => embedDone()); await closed();
same('Done without changes changes nothing', await pg.evaluate(() => FLE.build()), before);

// 3b. views: Conceptual shows each entity's description; Done places a picture of the view that is active, and the model keeps it
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice');
same('three views on the toolbar, Details active', await f.evaluate(() => [...document.querySelectorAll('[data-detail]')].map(b => [b.textContent.trim(), b.classList.contains('on')])), [['Details', true], ['Compact', false], ['Conceptual', false]]);
await f.evaluate(() => { soloEdit(null, () => { M.entities.find(e => e.name === 'Customer').description = 'A person or business that buys from us.'; }); }); await sleep(200);
await f.evaluate(() => document.getElementById('bConceptual').click()); await sleep(400);
const cv = await f.evaluate(() => ({ on: document.getElementById('bConceptual').classList.contains('on'), canvas: document.querySelector('#stage, svg') ? document.body.innerText.includes('no description yet') || !!Array.from(document.querySelectorAll('text')).find(t => t.textContent === 'no description yet') : false }));
check('Conceptual is active and an entity with no description says so while editing', cv.on && cv.canvas, cv);
await f.evaluate(() => embedDone()); await closed();
const d3 = await pg.evaluate(() => { const g = document.querySelector('#doc .dg.dm'); return { text: g.querySelector('svg').textContent, detail: JSON.parse(g.getAttribute('data-dms')).models[0].layout.detail }; });
check('Done in Conceptual places titles and descriptions, no attributes and no prompt', d3.text.includes('Customer') && d3.text.includes('A person or business that buys') && !d3.text.includes('customerId') && !d3.text.includes('no description yet'), d3.text);
same('the model keeps the view it was left in', d3.detail, 'conceptual');
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice');
check('re-opened in Conceptual, with every attribute still in the model', await f.evaluate(() => detailView() === 'conceptual' && document.getElementById('bConceptual').classList.contains('on') && M.entities.find(e => e.name === 'Customer').attributes.some(a => a.name === 'customerId')));
await f.evaluate(() => embedCancel()); await closed();

// 3c. themes: the app in Material, the model in Fine Line; the content theme chosen is kept with the model and its picture
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice');
same('the app opens in Material and the model in Fine Line', await f.evaluate(() => [document.documentElement.dataset.skin, document.getElementById('svg').dataset.cskin]), ['material', 'blueprint']);
const ticks = async () => f.evaluate(() => { themeMenu(document.getElementById('bTheme')); const m = document.querySelector('.menu'), out = []; let sec = ''; for (const n of m.children) { if (n.classList.contains('mh')) sec = n.textContent.startsWith('App') ? 'app' : 'content'; else if (n.querySelector('.chk') && n.querySelector('.chk').textContent) out.push(sec + ':' + n.textContent.replace('✓', '').trim()); } closeMenu(); return out; });
check('the theme menu ticks the app theme and the content theme', JSON.stringify(await ticks()).includes('app:Material Design') && JSON.stringify(await ticks()).includes('content:Blueprint'), await ticks());
await f.evaluate(() => applySkin('neumorphism')); await f.evaluate(() => setContentSkin('midnight')); await sleep(300);
const t2 = await ticks();
check('the ticks move to the themes chosen', t2.some(x => x.startsWith('app:Neumorphism')) && t2.some(x => x.startsWith('content:Midnight')), t2);
same('the app theme dresses the app; the content theme only the model', await f.evaluate(() => [document.documentElement.dataset.skin, document.getElementById('svg').dataset.cskin]), ['neumorphism', 'midnight']);
await f.evaluate(() => embedDone()); await closed();
const d4 = await pg.evaluate(() => { const g = document.querySelector('#doc .dg.dm'); return { theme: JSON.parse(g.getAttribute('data-dms')).models[0].layout.theme, bg: g.querySelector('svg > rect').getAttribute('style') }; });
check('Done keeps the content theme in the model and draws the picture in it', d4.theme === 'midnight' && /#0e1428/i.test(d4.bg), d4);
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice');
same('re-opened: the model keeps its theme, the app is Material again', await f.evaluate(() => [document.documentElement.dataset.skin, document.getElementById('svg').dataset.cskin]), ['material', 'midnight']);
await f.evaluate(() => { setContentSkin('blueprint'); }); await sleep(200); await f.evaluate(() => embedDone()); await closed();

// 4. save and re-open
const html = await pg.evaluate(() => FLE.build());
check('saved data model carries its model', /data-dms="\{&quot;format&quot;:&quot;data-model-studio&quot;/.test(html), html.slice(0, 200));
check('saved data model has no editor state', !/ed-dsel|contenteditable/.test(html));
await pg.evaluate((t) => FLE.load(t, 'again.html'), html); await sleep(300);
same('re-opened document unchanged', await pg.evaluate(() => FLE.build()), html);
await pg.evaluate(() => document.querySelector('#doc .dg.dm').dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
f = await waitEmbed('Invoice'); check('data model re-opens after the document is re-opened', !!f);
await f.evaluate(() => embedCancel()); await closed();

// 5. select and delete
await pg.click('#doc .dg.dm'); await pg.keyboard.press('Delete'); await sleep(100);
same('Delete removes the selected data model', await pg.evaluate(() => document.querySelectorAll('#doc .dg.dm').length), 0);
await pg.screenshot({ path: path.join(ROOT, 'test', 'out', 't55-data-model.png') });
await b.close();
