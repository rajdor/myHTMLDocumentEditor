// The example document (candy-shop-sop.html) opens cleanly, uses every kind of content the editor makes, and saves
// back unchanged.
import fs from 'fs';
import path from 'path';
import { open, check, same, load, ROOT } from './harness.mjs';
const { b, pg, errors } = await open();
const text = fs.readFileSync(path.join(ROOT, 'candy-shop-sop.html'), 'utf8');
await load(pg, text, 'candy-shop-sop.html');
const has = await pg.evaluate(() => { const q = s => document.querySelectorAll('#doc ' + s).length; return {
  title: q('h1'), subtitle: q('p.sub'), lead: q('p.bluf'), h2: q('h2') > 5, h2sub: q('p.h2sub') > 0, h3: q('h3') > 0, h4: q('h4') > 0, bold: q('b') > 0, italic: q('i') > 0,
  bullets: q('ul:not(.check)') > 0, checklist: q('ul.check > li > input[type=checkbox]') > 0, boxes: ['note', 'info', 'tip', 'warning', 'critical'].filter(t => q('.box.box-' + t + ' > p.box-h')).length, numbered: q('ol') > 0, idTags: q('span.id') > 0, table: q('.tw > table:not(.lop)') > 0, fancy: q('table.lop'), compact: q('table.dense') > 0, merged: q('td[colspan], td[rowspan]') > 0,
  code: q('pre'), qa: q('dl.qa dt') > 0, webLink: q('a[href^="https://"]') > 0, insideLink: q('a[href^="#"]') > 0, diagram: q('.dg svg'), editable: (document.querySelector('#doc .dg').getAttribute('data-drawio') || '').includes('mxGraphModel'), caption: q('p.cap') > 0, notes: q('.note') }; });
same('the example uses every kind of content', has, { title: 1, subtitle: 1, lead: 1, h2: true, h2sub: true, h3: true, h4: true, bold: true, italic: true, bullets: true, checklist: true, boxes: 5, numbered: true, idTags: true, table: true, fancy: 1, compact: true, merged: true, code: 1, qa: true, webLink: true, insideLink: true, diagram: 1, editable: true, caption: true, notes: 2 });
same('it opens with its saved index levels and notes margin', await pg.evaluate(() => [document.getElementById('s-index').value, document.getElementById('doc').classList.contains('notes-on')]), ['2', true]);
check('the inside link has a target', await pg.evaluate(() => [...document.querySelectorAll('#doc a[href^="#"]')].every(a => document.getElementById(a.getAttribute('href').slice(1)))));
same('its fonts are embedded: handwritten headings, Instrument Sans body, JetBrains Mono code and ID tags', ['Architects Daughter', 'Instrument Sans', 'JetBrains Mono'].map(f => new RegExp("@font-face \\{ font-family: '" + f + "';[^}]*url\\(data:font/woff2;base64,").test(text)), [true, true, true]);
same('and used where they should be', await pg.evaluate(() => ['h1', 'h2', 'p', 'pre', 'span.id'].map(s => getComputedStyle(document.querySelector('#doc ' + s)).fontFamily.split(',')[0].replace(/"/g, ''))), ['Architects Daughter', 'Architects Daughter', 'Instrument Sans', 'JetBrains Mono', 'JetBrains Mono']);
check('nothing in it points at the web except links', !/<(img|video|audio|source|script)[^>]+src="https?:/i.test(text));
const out = await pg.evaluate(() => FLE.build());
const body = t => t.replace(/<style>[\s\S]*?<\/style>/, '');
check('its content saves back unchanged', body(out) === body(text), body(out).length + ' vs ' + body(text).length);
same('no page errors', errors, []);
await b.close();
