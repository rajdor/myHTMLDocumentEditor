// Bold is one set weight (700), not relative to the text around it, and bold pasted from another program is kept only
// where it is emphasis: in a header cell, heading, Q&A question or box label it is dropped, and bold inside bold is one bold.
import { open, check, same, caretIn, caretCell, sleep, load } from './harness.mjs';
const { b, pg, errors } = await open();
const paste = (h) => pg.evaluate((h) => { const dt = new DataTransfer(); dt.setData('text/html', h); dt.setData('text/plain', 'x'); document.getElementById('doc').dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true })); }, h);
const inner = (s) => pg.evaluate(s => document.querySelector(s).innerHTML, s);
// every piece of text under a selector with the tags around it and its weight
const weights = (s = '#doc') => pg.evaluate(s => { const out = {}, root = document.querySelector(s), w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { const t = n.textContent.trim(); if (!t) continue; const chain = []; for (let e = n.parentElement; e && e !== root; e = e.parentElement) if (!/^(DIV|TABLE|THEAD|TBODY|TR|UL)$/.test(e.tagName)) chain.unshift(e.tagName.toLowerCase()); out[t] = chain.join('>') + ' ' + getComputedStyle(n.parentElement).fontWeight; } return out; }, s);
// the shape a browser puts on the clipboard: each element carries its computed style, so a span inside a header says bold too
const S = 'font-weight: 600; font-family: Arial; font-size: 14px; color: rgb(36,36,36);', N = 'font-weight: 400; font-family: Arial; font-size: 14px;';
const SRC = `<h3 style="${S}"><strong style="${S}">H3 strong</strong></h3><h3 style="${S}"><span style="${S}">H3 span</span></h3><h4 style="${S}"><span style="${S}">H4 span</span></h4>`
  + `<p style="${N}"><strong style="${S}">Para strong</strong> plain text</p><p style="${N}"><strong style="${S}"><span style="${S}">Nested</span> <i>bold</i></strong></p>`
  + `<ul><li style="${N}"><strong style="${S}">Item lead:</strong> rest</li></ul>`
  + `<table><thead><tr><th style="${S}">TH plain</th><th style="${S}"><strong style="${S}">TH strong</strong></th><th style="${S}"><span style="${S}">TH span</span> <i>it</i></th></tr></thead>`
  + `<tbody><tr><td style="${N}">TD plain</td><td style="${N}"><strong style="${S}">TD strong</strong></td><td style="${N}"><span style="${S}">TD span</span></td></tr></tbody></table>`;
const DOC = '<main><h1>T</h1><h2 id="h">Head</h2><h4 id="h4">Four</h4><p id="p">Para <b id="pb">bold</b></p><dl class="qa"><dt id="q">Question</dt><dd id="a">Answer</dd></dl>'
  + '<div class="box box-note" role="note"><p class="box-h" id="bl">Note</p><p id="bp">In box</p></div>'
  + '<div class="tw"><table><thead><tr><th id="th">Head cell</th></tr></thead><tbody><tr><td id="td">Body cell</td></tr></tbody></table></div><p id="e">End</p></main>';

// a whole pasted document
await load(pg, DOC); await caretIn(pg, '#e'); await paste(SRC); await sleep(100);
const w = await weights();
same('bold in a pasted heading is dropped (H3)', [w['H3 strong'], w['H3 span']], ['h3 700', 'h3 700']);
same('bold in a pasted H4 is dropped', w['H4 span'], 'h4 600');
same('bold in a pasted header cell is dropped, as a tag or as a styled span', [w['TH plain'], w['TH strong'], w['TH span']], ['th 600', 'th 600', 'th 600']);
same('other formatting in a pasted header cell is kept', w['it'], 'th>i 600');
same('bold in a paragraph, list item and body cell is kept at 700', [w['Para strong'], w['Item lead:'], w['TD strong'], w['TD span']], ['p>strong 700', 'li>strong 700', 'td>strong 700', 'td>b 700']);
same('text beside it stays plain', [w['plain text'], w['rest'], w['TD plain']], ['p 400', 'li 400', 'td 400']);
same('bold inside bold is one bold, and italic inside it stays', [w['Nested'], w['bold']], ['p>strong 700', 'p>strong>i 700']);
check('no text in the document is heavier than 700', Object.values(w).every(v => parseInt(v.split(' ').pop()) <= 700), w);

// inline text from another program pasted into places with their own weight
const INL = `<span style="${S}">in</span> <strong style="${S}">strong</strong> <i>it</i>`;
await load(pg, DOC);
for (const [name, sel] of [['a header cell', '#th'], ['a Q&A question', '#q'], ['a heading', '#doc h2'], ['an H4', '#doc h4'], ['a box label', '#doc p.box-h'], ['bold text', '#pb']]) {
  await caretIn(pg, sel); await paste(INL); await sleep(60);
  const h = await inner(sel);
  check('pasted into ' + name + ': bold is dropped, italic kept', !/<(b|strong)[ >]/.test(h) && h.endsWith('in strong <i>it</i>'), h);
}
for (const [name, sel] of [['a paragraph', '#e'], ['a body cell', '#td'], ['a Q&A answer', '#a'], ['a paragraph in a box', '#bp']]) {
  await caretIn(pg, sel); await paste(INL); await sleep(60);
  const h = await inner(sel);
  check('pasted into ' + name + ': bold is kept', h.endsWith('<b>in</b> <strong>strong</strong> <i>it</i>'), h);
}
// a table pasted into a header cell goes in as lines, and a heading pasted there is a plain line
await load(pg, DOC); await caretIn(pg, '#th'); await paste(`<h3>Title</h3><p><b>Bold</b> line</p>`); await sleep(60);
same('blocks pasted into a header cell lose their bold', await inner('#th'), 'Head cellTitle<br>Bold line');
await load(pg, DOC); await caretIn(pg, '#td'); await paste(`<h3>Title</h3><p><b>Bold</b> line</p>`); await sleep(60);
same('blocks pasted into a body cell keep theirs (a heading is a bold line)', await inner('#td'), 'Body cell<b>Title</b><br><b>Bold</b> line');

// copied in the editor: bold is the author's own, so it stays wherever it goes
await load(pg, DOC); await caretIn(pg, '#th'); await paste('<div data-fle-clip="1"><b>own</b></div>'); await sleep(60);
same('bold copied in the editor is kept in a header cell', await inner('#th'), 'Head cell<b>own</b>');
same('and it is 700 there, not 900', (await weights('#th')).own, 'b 700');

// the weight is set, not relative, in a saved document too
const saved = await pg.evaluate(() => FLE.build());
check('the saved document carries the set bold weight', /main b, main strong \{ font-weight: 700; \}/.test(saved));
check('no page errors', errors.length === 0, errors);
await b.close();
