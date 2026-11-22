// Shared by t45-structure and nb7-markdown-structure: every toolbar command and key, in every kind of block, with the cursor only,
// part of a block, the whole block, or a selection running into the next block. After each the page is checked for
// structure the editor should never make (test/inv.js), then saved and reopened (HTML) or written and read back (Markdown),
// which must not change it. `every` runs all four selections for every case (slow); otherwise they take turns.
import fs from 'fs';
import path from 'path';
import { ROOT, sleep } from './harness.mjs';
export async function matrix(pg, MODE, every = false) {
await pg.evaluate(fs.readFileSync(path.join(ROOT, 'test', 'inv.js'), 'utf8'));
const DOC = '<main><h1>Title</h1>' +
 '<p data-t="p">Plain words in a paragraph with <b>bold bit</b> and <a href="https://e.com">a link</a>.</p>' +
 '<h2 data-t="h">Heading two text</h2>' +
 '<ul data-t="ul"><li data-t="li">first item words</li><li>second item<ul><li data-t="nli">nested item words</li></ul></li></ul>' +
 '<ul class="check" data-t="ck"><li data-t="cli"><input type="checkbox">check item words</li></ul>' +
 '<ol data-t="ol"><li data-t="oli">numbered item words</li></ol>' +
 '<dl class="qa" data-t="dl"><dt data-t="dt">Question words here</dt><dd data-t="dd">Answer words here</dd></dl>' +
 '<div class="tw"><table><thead><tr><th data-t="th">Head cell</th><th>H2</th></tr></thead><tbody><tr><td data-t="td">cell words here</td><td>c2</td></tr></tbody></table></div>' +
 '<div class="box box-tip" role="note"><p class="box-h">Tip</p><p data-t="bp">Box paragraph words</p></div>' +
 '<pre data-t="pre">code line one\ncode line two</pre>' +
 '<p data-t="last">Last paragraph words.</p></main>';
const TARGETS = MODE === 'md' ? ['p', 'h', 'li', 'nli', 'cli', 'oli', 'th', 'td', 'pre'] : ['p', 'h', 'li', 'nli', 'cli', 'oli', 'dt', 'dd', 'th', 'td', 'bp', 'pre'];
const CMDS = MODE === 'md' ? ['bold', 'italic', 'clear', 'ul', 'ol', 'check', 'indent', 'outdent', 'code', 'divider', 'olstart', 'fmt:strike', 'fmt:code', 'blk:p', 'blk:h1', 'blk:h2', 'blk:h3', 'blk:h4', 'blk:pre', 'k:Enter', 'k:ShiftEnter', 'k:Backspace', 'k:Delete', 'k:Tab', 'k:ShiftTab'] : ['bold', 'italic', 'clear', 'ul', 'ol', 'check', 'indent', 'outdent', 'code', 'divider', 'tag', 'qa', 'ldense', 'olstart', 'fmt:sup', 'fmt:sub', 'fmt:strike', 'fmt:code', 'blk:p', 'blk:h1', 'blk:p.sub', 'blk:h2', 'blk:p.h2sub', 'blk:h3', 'blk:h4', 'blk:p.bluf', 'blk:p.cap', 'blk:pre', 'blk:dt', 'blk:dd', 'box:tip', 'box:none', 'k:Enter', 'k:ShiftEnter', 'k:Backspace', 'k:Delete', 'k:Tab', 'k:ShiftTab'];
const SELS = ['caret', 'part', 'whole', 'cross'];
const res = {}; let n = 0;
for (const [ti, t] of TARGETS.entries()) for (const [ci, c] of CMDS.entries()) for (const sm of (every ? SELS : [SELS[(ti + ci) % SELS.length]])) {
  await pg.evaluate((h, md) => { if (md) h = h.replace(/<dl[\s\S]*?<\/dl>/, '').replace(/<div class="box[\s\S]*?<\/div>/, ''); FLE.load(h, md ? 'f.md' : 'm.html', md ? { asTyped: true } : undefined); }, DOC, MODE === 'md'); await sleep(10);
  await pg.evaluate((t, sm) => {
    const e = document.querySelector('[data-t="' + t + '"]'), w = document.createTreeWalker(e, 4), ts = []; while (w.nextNode()) if (w.currentNode.data.trim()) ts.push(w.currentNode);
    const a = ts[0], r = document.createRange();
    if (sm === 'caret') { r.setStart(a, Math.min(3, a.length)); r.collapse(true); }
    else if (sm === 'part') { r.setStart(a, Math.min(2, a.length)); r.setEnd(a, Math.min(8, a.length)); }
    else if (sm === 'whole') { r.selectNodeContents(e); }
    else { const all = document.createTreeWalker(document.querySelector('#doc'), 4), list = []; while (all.nextNode()) if (all.currentNode.data.trim()) list.push(all.currentNode); const z = list[list.indexOf(ts[ts.length - 1]) + 1] || ts[ts.length - 1]; r.setStart(a, Math.min(2, a.length)); r.setEnd(z, Math.min(3, z.length)); }
    const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); document.dispatchEvent(new Event('selectionchange'));
  }, t, sm);
  await sleep(10);
  const WORDS = () => pg.evaluate(() => { const d = document.querySelector('#doc'), k = d.cloneNode(true); k.querySelectorAll('.fig,.dg,.note-log,.box-h,nav').forEach(x => x.remove()); k.querySelectorAll('br,p,h1,h2,h3,h4,li,dt,dd,td,th,pre,div').forEach(x => x.before(' ')); return k.textContent.split(/\s+/).filter(Boolean); });
  const keeps = !/^(k:(Enter|ShiftEnter|Backspace|Delete)|divider)$/.test(c) && !(sm === 'caret' && /^(code|tag|box:tip|qa)$/.test(c)) && !(c === 'k:Tab' && /^(th|td|pre)$/.test(t)), w0 = keeps ? await WORDS() : null;   // these split or remove text by design
  const [k, v] = c.split(':');
  if (k === 'k') { if (v === 'ShiftEnter') { await pg.keyboard.down('Shift'); await pg.keyboard.press('Enter'); await pg.keyboard.up('Shift'); } else if (v === 'ShiftTab') { await pg.keyboard.down('Shift'); await pg.keyboard.press('Tab'); await pg.keyboard.up('Shift'); } else await pg.keyboard.press(v); }
  else if (k === 'fmt' || k === 'blk' || k === 'box') await pg.evaluate((id, v) => { const s = document.querySelector(id); s.value = v; s.dispatchEvent(new Event('change', { bubbles: true })); }, k === 'fmt' ? '#s-fmt' : k === 'blk' ? '#s-block' : '#s-boxtype', v);
  else await pg.evaluate((a) => { const b = document.querySelector('#chrome [data-a="' + a + '"]'); if (b) b.click(); }, c);
  await sleep(15);
  const r = MODE === 'md' ? await pg.evaluate(() => { const d = document.querySelector('#doc'), inv = INV(d), M = FLE.NB.MD, meta = { style: { bullet: '-', em: '*', strong: '**' }, fm: '', gap: '' };
      const w1 = M.write(d.cloneNode(true), meta), m2 = M.read(w1); FLE.load('<main>' + m2.html + '</main>', 'f.md', { asTyped: true }); const w2 = M.write(document.querySelector('#doc').cloneNode(true), meta);
      if (w1 !== w2) { let i = 0; while (w1[i] === w2[i]) i++; inv.push(['markdown write, read, write changes the text', JSON.stringify(w1.slice(Math.max(0, i - 60), i + 60)) + '  ==>  ' + JSON.stringify(w2.slice(Math.max(0, i - 60), i + 60))]); }
      const lost = M.lost(d, meta); return inv; })
    : await pg.evaluate(() => { const d = document.querySelector('#doc'), inv = INV(d); const h1 = FLE.build(); FLE.load(h1, 'm.html'); const h2 = FLE.build(); if (h1 !== h2) { let i = 0; while (h1[i] === h2[i]) i++; inv.push(['save, reopen, save changes the file', h1.slice(Math.max(0, i - 80), i + 80) + '  ==>  ' + h2.slice(Math.max(0, i - 80), i + 80)]); } return inv; });
  if (keeps) { const w1 = await WORDS(); if (w0.join(' ') !== w1.join(' ')) { let i = 0; while (w0[i] === w1[i]) i++; r.push(['words joined, split or lost', w0.slice(Math.max(0, i - 2), i + 3).join(' ') + '  ==>  ' + w1.slice(Math.max(0, i - 2), i + 3).join(' ')]); } }
  for (const [rule, ex] of r) { const key = rule + ' | ' + c; (res[key] = res[key] || { n: 0, where: new Set(), ex }).n++; res[key].where.add(t + '/' + sm); }
  n++;
}
return { n, problems: Object.entries(res).map(([k, v]) => k + ' at ' + [...v.where].slice(0, 6).join(' ') + ': ' + v.ex) };
}
