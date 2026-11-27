(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const doc = $('#doc'), idx = $('#idx'), dbar = $('#dbar'), statusEl = $('#status');
const DOC_CSS = $('#doc-css').textContent;
const STARTER = '<h1>Untitled document</h1><p class="sub">Subtitle</p><h2>Section</h2><p>Start writing.</p>';
const STATES = ['note', 'good', 'bad', 'warning', 'alert', 'critical', 'new', 'changed', 'retire', 'neutral'];
let board = null, sel = null, selC = null, mode = null, connFrom = null, editing = null, lastRange = null;
let idxDepth = 1, showNotes = false, handle = null, fname = 'document.html', dirty = false, undo = [], timer = null, cascade = 0;

const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
const snap = (v, e) => (e && e.altKey) ? Math.round(v) : Math.round(v / 8) * 8;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

/* ---------- document: index, fit, status ---------- */
/* An older page diagram is shown at its drawn size, as the saved page shows it (with no script there to shrink it): a
   narrow window scrolls it sideways. Scaling left on one by an earlier version is taken off. */
function fit() {
  $$('.fig', doc).forEach(f => { f.style.height = ''; f.style.maxWidth = ''; if (f.firstElementChild) f.firstElementChild.style.transform = ''; if (!f.getAttribute('style')) f.removeAttribute('style'); });
}
function slug(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; }
const HEADS = 'h2,h3,h4';
function heads(root) { return $$(HEADS, root).filter(h => !h.closest('.fig,.dg,td,th')); }
/* The headings the Index lists: H2 to H4; with more than one H1 on the page, the H1s too, unnumbered, so that the H2
   numbers in the Index still match the numbers on the page. */
function idxHeads(root) { const h1s = $$('h1', root).filter(h => !h.closest('.fig,.dg,td,th')); return h1s.length > 1 ? $$('h1,' + HEADS, root).filter(h => !h.closest('.fig,.dg,td,th')) : heads(root); }
function indexHtml(root, depth) {
  const top = [], stack = [];
  idxHeads(root).forEach(h => {
    let L = +h.tagName[1] - 1; if (L > depth) return;
    const n = { h, kids: [] };
    if (L === 0) { top.push(Object.assign(n, { loose: true })); stack.length = 0; return; }
    if (L === 1) { top.push(n); stack.length = 0; stack.push(n); return; }
    if (!stack.length) { top.push(Object.assign(n, { loose: true })); return; }
    L = Math.min(L, stack.length + 1); stack.length = L - 1; stack[L - 2].kids.push(n); stack.push(n);
  });
  const r = list => list.map(n => '<li' + (n.loose ? ' class="u"' : '') + '><a href="#' + n.h.id + '">' + esc(n.h.textContent) + '</a>' + (n.kids.length ? '<ol>' + r(n.kids) + '</ol>' : '') + '</li>').join('');
  return r(top);
}
function rebuild() {
  const seen = {};
  idxHeads(doc).forEach(h => { const base = slug(h.textContent); let s = base, k = 1; while (seen[s]) s = base + '-' + (++k); seen[s] = 1; h.id = s; });
  idx.innerHTML = indexHtml(doc, idxDepth); { const ib = $('#s-index'); ib.value = String(idxDepth); ib.lastElementChild.textContent = idxDepth; } notesUI();
  const h1 = $('h1', doc); document.title = (h1 ? h1.textContent.trim() : 'Document') + ' - editor';
  foldApply();
}
/* ---------- folding sections ----------
   An aid while editing only: nothing about it is saved, and a page opens with every section open. Any heading (H1 to H4)
   on the page itself can be folded with the arrow in the margin beside it; that hides everything below it down to the
   next heading of the same or a higher level. A folded block is hidden "until found", so the browser's Find opens its
   section. The section the cursor is in never stays folded, and following an Index link opens the sections above it.
   Undo keeps the folds, by heading text. Printing shows everything. */
const FOLD_HEADS = 'h1,h2,h3,h4';
let foldEl = new WeakSet(), foldKeys = new Set();
const foldHeads = () => [...doc.children].filter(e => e.matches(FOLD_HEADS));
function foldKeyed() { const n = {}; return foldHeads().map(h => { const k = h.tagName + ':' + h.textContent.replace(/\s+/g, ' ').trim(); n[k] = (n[k] || 0) + 1; return [h, k + '#' + n[k]]; }); }
function foldApply(moveCaret) {
  const keyed = foldKeyed(), isF = new Set();
  for (const [h, k] of keyed) if (foldEl.has(h) || foldKeys.has(k)) { isF.add(h); foldEl.add(h); }
  const s = getSelection(); let at = s.rangeCount && doc.contains(s.anchorNode) ? s.anchorNode : null; if (at && at.nodeType !== 1) at = at.parentNode;
  while (at && at.parentNode !== doc) at = at.parentNode;
  const pass = () => { const hide = new Set(), closed = []; let L = 9;
    for (const e of doc.children) {
      const h = e.matches(FOLD_HEADS) ? +e.tagName[1] : 0;
      if (h) { while (closed.length && closed[closed.length - 1].lvl >= h) closed.pop(); }
      if (closed.length) hide.add(e);
      if (h && isF.has(e)) closed.push({ lvl: h, h: e });
      e._foldBy = closed.length ? closed.slice() : null;
    }
    return hide; };
  let hide = pass();
  if (at && hide.has(at)) {
    if (moveCaret) { const by = at._foldBy || []; if (by.length) caret(by[0].h, true); }   // folding the section the cursor is in: the cursor goes to the end of its heading
    else { (at._foldBy || []).forEach(c => { isF.delete(c.h); foldEl.delete(c.h); }); hide = pass(); }   // editing into a folded section opens it
  }
  for (const e of doc.children) {
    const hid = hide.has(e); if (hid !== e.classList.contains('ed-fhide')) { e.classList.toggle('ed-fhide', hid); if (hid) e.setAttribute('hidden', 'until-found'); else e.removeAttribute('hidden'); }
    if (e.matches(FOLD_HEADS)) e.classList.toggle('ed-folded', isF.has(e));
    delete e._foldBy;
  }
  foldKeys = new Set(foldKeyed().filter(([h]) => isF.has(h)).map(([, k]) => k));
  foldDraw();
}
function foldSet(h, on) { if (on) foldEl.add(h); else foldEl.delete(h); foldKeys.clear(); foldApply(true); }
function foldAll(on) { foldHeads().forEach(h => { if (on) foldEl.add(h); else foldEl.delete(h); }); foldKeys.clear(); foldApply(true); }
function foldReset() { foldEl = new WeakSet(); foldKeys = new Set(); }
function foldOpenTo(t) { let e = t; while (e && e.parentNode !== doc) e = e.parentNode; if (!e || !e.classList.contains('ed-fhide')) return; let lvl = e.matches(FOLD_HEADS) ? +e.tagName[1] : 9; for (let p = e.previousElementSibling; p; p = p.previousElementSibling) if (p.matches(FOLD_HEADS) && +p.tagName[1] < lvl) { foldEl.delete(p); lvl = +p.tagName[1]; } foldKeys.clear(); foldApply(); }
const foldBox = document.createElement('div'); foldBox.id = 'folds'; foldBox.setAttribute('aria-hidden', 'false'); document.body.appendChild(foldBox);
function foldDraw() {
  const hs = foldHeads().filter(h => !h.classList.contains('ed-fhide')), d = doc.getBoundingClientRect(), sx = scrollX, sy = scrollY;
  while (foldBox.children.length > hs.length) foldBox.lastChild.remove();
  while (foldBox.children.length < hs.length) { const b = document.createElement('button'); b.type = 'button'; b.className = 'fold-t'; b.tabIndex = -1; b.innerHTML = '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M5 3l6 5-6 5z"/></svg>'; foldBox.appendChild(b); }
  hs.forEach((h, i) => { const b = foldBox.children[i], r = h.getBoundingClientRect(), f = h.classList.contains('ed-folded'), cs = getComputedStyle(h), lh = parseFloat(cs.lineHeight) || r.height;
    b._h = h; b.classList.toggle('on', f); const t = (f ? 'Expand' : 'Collapse') + ' "' + h.textContent.trim().slice(0, 60) + '"'; b.title = t + ' (Alt+click: every heading)'; b.setAttribute('aria-label', t); b.setAttribute('aria-expanded', f ? 'false' : 'true');
    b.style.left = (d.left + sx - 24) + 'px'; b.style.top = (r.top + sy + parseFloat(cs.paddingTop) + Math.min(lh, r.height) / 2 - 9) + 'px'; });
}
foldBox.addEventListener('mousedown', e => e.preventDefault());
foldBox.addEventListener('click', e => { const b = e.target.closest('.fold-t'); if (!b || !b._h || !doc.contains(b._h)) return; e.preventDefault(); if (e.altKey) foldAll(!b._h.classList.contains('ed-folded')); else foldSet(b._h, !b._h.classList.contains('ed-folded')); });
new ResizeObserver(() => foldDraw()).observe(doc); addEventListener('resize', foldDraw);
doc.addEventListener('beforematch', e => foldOpenTo(e.target));
idx.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) { foldOpenTo(t); t.scrollIntoView({ behavior: 'smooth' }); } });
$('#idx-fold').addEventListener('click', e => { const b = e.target.closest('button'); if (b) foldAll(b.dataset.f === 'collapse'); });
let remoteImgs = 0;
function status() { const sv = $('[data-a="save"]'); sv.classList.toggle('has', dirty); sv.title = 'Save (Ctrl+S)' + (dirty ? ': unsaved changes' : ''); statusEl.textContent = [remoteImgs ? remoteImgs + (remoteImgs === 1 ? ' web item shown as a link card' : ' web items shown as link cards') + ', not downloaded' : ''].filter(Boolean).join(' | '); helpInfo(); }
/* The editor version and the document name are shown in the Help dialog. */
function helpInfo() { const i = $('#help-info'); if (i) i.textContent = PRODUCT.label + ' v' + VERSION + ' | Document: ' + fname + (dirty ? ' (unsaved changes)' : '') + (statusEl.textContent ? ' | ' + statusEl.textContent : ''); }
function keepGoing(what) { return !dirty || confirm('This document has unsaved changes. Save it first if you want to keep them.\n\nOK: discard the changes and ' + what + '.\nCancel: go back to the document.'); }
let tidyQ = false;
function touch() {
  if (!tidyQ) { tidyQ = true; queueMicrotask(() => { tidyQ = false; if (tidy()) styleUI(); }); }   // once the command that changed the page has finished
  olTidy(); cellMarks();
  checkFix(doc); dirty = true; status(); clearTimeout(timer);
  timer = setTimeout(() => { histSnap(); if (NB.foreign()) return; try { localStorage.setItem(PRODUCT.key + '-draft', clean().innerHTML); } catch (e) { } }, 400);   // the browser's draft is for pages; a Markdown file's unsaved work is kept in its history
}
doc.addEventListener('input', touch);
/* Document history: whole-document snapshots, so structural changes (tables, Q&A, code, Clear format, diagrams) undo as well as typing. */
let hist = [], hpos = -1;
function nodePath(n) { const p = []; while (n && n !== doc) { const par = n.parentNode; if (!par) return null; p.unshift([...par.childNodes].indexOf(n)); n = par; } return n === doc ? p : null; }
function fromPath(p) { let n = doc; for (const i of p) { n = n.childNodes[i]; if (!n) return null; } return n; }
function selState() { const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return null; const r = s.getRangeAt(0), p = nodePath(r.startContainer); return p ? { p, o: r.startOffset } : null; }
function histSnap() {
  rebuild(); const h = preLF(doc.innerHTML).replace(/ ?\bed-(dsel|cell|fhide|folded)\b/g, '').replace(/ hidden="until-found"/g, '').replace(/ data-ed-ct(="")?/g, '').replace(/ class=""/g, ''); if (hpos >= 0 && hist[hpos].h === h) { hist[hpos].sel = selState() || hist[hpos].sel; return; }
  hist = hist.slice(0, hpos + 1); hist.push({ h, sel: selState() }); if (hist.length > 80) hist.shift(); hpos = hist.length - 1;
}
/* HTML drops a line break straight after <pre> each time it is read, so HTML that will be read again gets one more there,
   and a code block that starts with an empty line keeps it. */
const preLF = h => h.replace(/<pre(\s[^>]*)?>\n/g, m => m + '\n');
function histReset() { hist = []; hpos = -1; histSnap(); }
function histGo(d) {
  if (board) { if (d < 0) undoDiagram(); return; }
  clearTimeout(timer); histSnap(); const i = hpos + d; if (i < 0 || i >= hist.length) return;
  cellSelClear();
  hpos = i; const e = hist[i]; deactivate(); doc.innerHTML = e.h; prepView();
  if (e.sel) { const n = fromPath(e.sel.p); if (n) { try { const r = document.createRange(); r.setStart(n, Math.min(e.sel.o, n.nodeType === 3 ? n.length : n.childNodes.length)); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); } catch (x) { } } }
  dirty = true; status(); rebuild(); styleUI();
}
doc.addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey && (e.key === ' ' || e.key === 'Enter' || /^[.,;:!?]$/.test(e.key))) { clearTimeout(timer); histSnap(); } }, true);
doc.addEventListener('beforeinput', e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); histGo(e.inputType === 'historyUndo' ? -1 : 1); } });
window.addEventListener('resize', fit);
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
// The labels under the toolbar groups go when the toolbar wraps to a second row. They take no width, so showing or hiding them cannot change the wrapping.
function tbarWrap() { const kids = [...$('#tbar').children].filter(x => x.offsetParent), top = kids.length ? kids[0].offsetTop : 0; $('#chrome').classList.toggle('wrapped', kids.some(x => x.offsetTop > top + 16)); }
function thinUI(set) { let v; try { if (set !== undefined) localStorage.setItem(PRODUCT.key + '-thin', set ? '1' : ''); v = localStorage.getItem(PRODUCT.key + '-thin') === '1'; } catch (e) { v = !!set; } $('#chrome').classList.toggle('thin', v); const b = $('#thin'); b.setAttribute('aria-pressed', v ? 'true' : 'false'); b.title = v ? 'Thin toolbar is on: show the labels under the buttons' : 'Thin toolbar: hide the labels under the buttons'; }
function chromeHeight() { tbarWrap(); document.documentElement.style.setProperty('--ch', $('#chrome').offsetHeight + 'px'); }
new ResizeObserver(chromeHeight).observe($('#chrome'));

/* ---------- text editing ---------- */
document.execCommand('defaultParagraphSeparator', false, 'p');
document.addEventListener('selectionchange', () => {
  const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
  const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement;
  if (n && !n.closest('.fig')) { lastRange = s.getRangeAt(0).cloneRange(); styleUI(); }
  if ($('.note', doc) && tidyNotes(true)) touch();
  const ol = $('.note-log[open]', doc); if (ol && !ol.parentNode.contains(n)) openLog(null, false);
});
function styleUI() {
  const s = getSelection(); if (!s.rangeCount) return; let n = s.anchorNode; if (n && n.nodeType !== 1) n = n.parentElement;
  if (!n || !doc.contains(n) || n.closest('.fig')) return;
  mmUI(n); if (showBlocks) ctSelect(ctAt(n));
  const box = $('#s-block'), first = box.options[0], b = n.closest('dt,dd,h1,h2,h3,h4,pre,p,li,td,th');
  let v = '', label = 'Style';
  if (b && doc.contains(b)) {
    const t = b.tagName.toLowerCase();
    if (t === 'p') v = b.classList.contains('sub') ? 'p.sub' : b.classList.contains('h2sub') ? 'p.h2sub' : b.classList.contains('bluf') ? 'p.bluf' : b.classList.contains('cap') ? 'p.cap' : 'p';
    else if (/^h[1-4]$/.test(t) || t === 'pre' || t === 'dt' || t === 'dd') v = t;
    else label = t === 'li' ? 'List item' : 'Table cell';
  } else label = inCell() ? 'Grid cell' : 'Paragraph';
  first.textContent = label; box.value = v;
  const inTable = !!n.closest('td,th'); $$('#tbar button.t').forEach(x => x.classList.toggle('dim', !inTable));
  { const tc = n.closest('td,th'), hs = tc && !tc.closest('.fig') ? tHeaderState(tc) : {}; ['hr', 'sr', 'hc', 'sc'].forEach(a => $('[data-a="' + a + '"]').classList.toggle('on', !!hs[a])); }
  const tops = $('#tbar .tops'); if (tops.hidden === inTable) { tops.hidden = !inTable; chromeHeight(); } // the row, column and merge buttons show only in a table
  tfSync(inTable);
  [['bold', 'bold'], ['italic', 'italic'], ['ul', 'insertUnorderedList'], ['ol', 'insertOrderedList']].forEach(([a, c]) => { let on = false; try { on = document.queryCommandState(c); } catch (e) { } $('[data-a="' + a + '"]').classList.toggle('on', on); });
  const bx = boxAt(n); $('#s-boxtype').value = bx ? boxType(bx) : ''; { const io = $('#s-boxtype option[value="icon"]'); io.disabled = !bx; io.textContent = bx && bx.classList.contains('box-noicon') ? 'Show icon' : 'Hide icon'; }
  $$('#s-fmt option[value]').forEach(o => { if (FMT[o.value]) o.textContent = (fmtOn(o.value) ? '\u2713 ' : '') + FMT[o.value][0]; }); { const la = listAt(); $('[data-a="indent"]').classList.toggle('dim', !la); $('[data-a="outdent"]').classList.toggle('dim', !la); }
  { const q = qaItem(), noList = !!(q && q.tagName === 'DT'); ['ul', 'ol', 'check'].forEach(a => $('[data-a="' + a + '"]').classList.toggle('dim', noList)); $('[data-a="qa"]').classList.toggle('on', !!q); $('[data-a="qa"]').classList.toggle('dim', !q && !!n.closest('li,td,th,pre')); }
  { const lt = listTop(); $('[data-a="ldense"]').classList.toggle('on', !!(lt && lt.classList.contains('dense'))); $('[data-a="ldense"]').classList.toggle('dim', !lt); const o = olAt(); $('[data-a="olstart"]').classList.toggle('dim', !o); $('[data-a="olstart"]').classList.toggle('on', !!(o && o.hasAttribute('start'))); }
  const ck = inCheck(); $('[data-a="check"]').classList.toggle('on', ck); if (ck) $('[data-a="ul"]').classList.remove('on');
  { const code = selCode(); CODE_OFF.forEach(a => { const x = $('#tbar [data-a="' + a + '"]'); if (x && code) x.classList.add('dim'); }); $('#s-fmt').classList.toggle('dim', code); ['tag', 'link'].forEach(a => $('#tbar [data-a="' + a + '"]').classList.toggle('dim', code)); $('[data-a="bold"]').classList.toggle('dim', code); $('[data-a="italic"]').classList.toggle('dim', code); }
  if (mdCellSel()) MD_CELL_OFF.forEach(a => { const x = $('#tbar [data-a="' + a + '"]'); if (x) x.classList.add('dim'); });
}
function live() { const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) { let n = s.anchorNode; if (n.nodeType !== 1) n = n.parentElement; if (!n.closest('.fig')) lastRange = s.getRangeAt(0).cloneRange(); } }
function restore() { doc.focus(); if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); } }
/* Blocks sit in the document itself, in a margin note or in a box. */
function holds(p) { return !!(p && p.classList && (p.classList.contains('note-body') || p.classList.contains('box'))); }
function curBlock() { let n = lastRange ? lastRange.startContainer : null; if (!n) return null; if (n.nodeType !== 1) n = n.parentElement; while (n && n.parentNode !== doc && !holds(n.parentNode)) n = n.parentNode; return n && n.closest('.note-log') ? n.closest('.note') : n; }
function cmd(c, v) { restore(); document.execCommand(c, false, v); touch(); }
function setBlock(v) {
  live();
  /* A list item cannot be a heading, a paragraph style, a code block or a Q&A item: it leaves its list first (as Outdent
     does, level by level), and the style goes on the paragraph it becomes. A list inside a Q&A answer is left alone. */
  if (!qaItem(lastRange) && listItems().length) { restore(); liftLists(); live(); }
  if (!qaItem(lastRange)) { restore(); if (liftMixed()) live(); }   // items the selection reaches in other lists, or from outside a list
  const [tag, cls] = v.split('.'); const qa = qaItem(lastRange);
  if (tag === 'dt' || tag === 'dd' || qa) { qaConvert(tag, cls); return; }
  restore(); if (tag === 'pre' ? preJoin() : blockEach(tag, cls)) { touch(); return; }
  document.execCommand('formatBlock', false, tag);
  let n = getSelection().anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; n = n && n.closest('p,h1,h2,h3,h4,pre');
  if (n && doc.contains(n)) { if (cls) n.className = cls; else n.removeAttribute('class'); }
  touch();
}
/* ---------- keeping the structure sound ----------
   The browser's own editing commands can leave structures the editor never makes: a list inside a heading, markup in a
   code block, text styled with the look of the block it came from (after Enter or Delete across two blocks). The
   commands below avoid most of them, and tidy() mends any that still appear, after every change. */
/* Code block over several blocks: one code block with a line for each block, as the browser would otherwise run
   their text together. The blocks must sit side by side (in the page or in one box); a single block goes the browser's way. */
function selBlocks() { const s = getSelection(); if (!s.rangeCount) return []; const r = s.getRangeAt(0); if (r.collapsed) { const p = blockOf(r.startContainer); return p ? [p] : []; }   // the cursor alone counts only in a code block, whose lines become blocks
  return $$('p,h1,h2,h3,h4,pre', doc).filter(b => r.intersectsNode(b) && !b.closest('.fig,.dg,.note-log,.link-card,table,li,dl') && !b.matches('.box-h') && !b.parentElement.closest('p,h1,h2,h3,h4,pre')); }
/* A line style over several blocks goes on each of them, as the browser would otherwise make them one block with line
   breaks. A code block among them gives a block for each of its lines. */
function blockEach(tag, cls) {
  const bs = selBlocks(); if (bs.length < 2 && !(bs.length && bs[0].matches('pre'))) return false; const c = caretGet();
  bs.forEach(b => {
    if (b.tagName === tag.toUpperCase() && (b.getAttribute('class') || '') === (cls || '')) return;   // already this style: left as it is, with what it carries
    const parts = b.matches('pre') ? preText(b).replace(/\n$/, '').split('\n').map(l => { const n = document.createElement(tag); n.textContent = l; return n; }) : [(() => { const n = document.createElement(tag); n.append(...b.childNodes); return n; })()];
    [...b.attributes].forEach(x => { if (!/^(class|style|data-md-h|data-lang)$/.test(x.name)) parts[0].setAttribute(x.name, x.value); });   // an id stays, so links to the block still reach it
    parts.forEach(n => { if (cls) n.className = cls; if (!n.firstChild) n.appendChild(document.createElement('br')); });
    b.replaceWith(...parts);
  });
  caretPut(c); return true;
}
function preJoin() {
  const s = getSelection(); if (!s.rangeCount) return false; const r = s.getRangeAt(0); if (r.collapsed && !blockOf(r.startContainer)) return false;
  const bs = selBlocks(); if (bs.length === 1 && bs[0].matches('pre')) return true;   // already a code block
  if (bs.length < 2 || bs.some(b => b.parentNode !== bs[0].parentNode)) return false;
  const lines = []; bs.forEach(b => lines.push(...preText(b).replace(/\n$/, '').split('\n')));
  const pre = document.createElement('pre'); lines.forEach((l, i) => { if (i) pre.appendChild(document.createElement('br')); if (l) pre.appendChild(document.createTextNode(l)); });
  if (!pre.firstChild) pre.appendChild(document.createElement('br'));
  bs[0].replaceWith(pre); bs.slice(1).forEach(b => b.remove());
  const q = document.createRange(); q.selectNodeContents(pre); s.removeAllRanges(); s.addRange(q); lastRange = q.cloneRange(); return true;
}
/* A selection that starts outside a list and runs into one: the list items it reaches leave their list (each becomes a
   paragraph after the part of the list before it; the rest of the list follows), so a line style can go on them too. */
function liftMixed() {
  const s = getSelection(); if (!s.rangeCount) return false; const r = s.getRangeAt(0); if (r.collapsed) return false;
  const lis = $$('li', doc).filter(li => r.intersectsNode(li) && !li.closest('.fig,.dg,.note-log,table,dl'));
  if (!lis.length) return false;
  const c = caretGet(), touched = [];
  lis.reverse().forEach(li => {
    let top = li.parentNode; while (top.parentNode && top.parentNode.closest && top.parentNode.closest('li') && doc.contains(top.parentNode)) top = top.parentNode.closest('li').parentNode;
    const after = document.createRange(); after.setStartAfter(li); after.setEndAfter(top); const rest = after.extractContents();
    touched.push(top); const host = top.parentNode, ref = top.nextSibling, p = document.createElement('p'), subs = []; if (li.id) p.id = li.id;
    [...li.childNodes].forEach(k => { if (k.nodeType === 1 && k.matches('ul,ol')) subs.push(k); else if (!(k.nodeType === 1 && k.matches('input'))) p.appendChild(k); });
    const par = li.parentNode; li.remove();
    for (let l = par; l && l !== top.parentNode;) { const up = l.parentNode; if (l.matches('ul,ol') && !l.children.length) l.remove(); else if (l.matches('li') && !l.textContent.trim() && !l.querySelector('img,input')) l.remove(); l = up && up.matches && up.matches('ul,ol,li') ? up : null; if (l && !doc.contains(l)) break; }
    if (!p.firstChild) p.appendChild(document.createElement('br'));
    const add = n => host.insertBefore(n, ref);
    add(p); subs.forEach(n => { add(n); touched.push(n); });
    [...rest.childNodes].forEach(n => { if (n.nodeType === 1 && n.matches('ul,ol') && !n.querySelector('li')) return; if (n.nodeType === 3 && !n.data.trim()) return; add(n); if (n.nodeType === 1) touched.push(n); });
  });
  listMend(touched); caretPut(c); return true;
}
/* After items leave their list: an item left with only an inner list gives its place to that list's items, and empty
   items and lists go. */
function listMend(roots) {
  const mine = n => roots.some(r => r.isConnected && r.contains(n));
  for (let k = 0; k < 6; k++) {
    let did = false;
    $$('li', doc).filter(li => mine(li) && !li.closest('.fig,.dg,.note-log,table,dl')).forEach(li => {
      const own = [...li.childNodes].filter(n => !(n.nodeType === 1 && n.matches('ul,ol'))), subs = [...li.children].filter(n => n.matches('ul,ol'));
      const empty = !own.some(n => n.nodeType === 3 ? n.data.trim() : n.nodeType === 1 && (n.textContent.trim() || n.matches('img,input,br') && n.matches('img,input') || n.querySelector('img,input')));
      if (!empty) return;
      if (subs.length) { li.replaceWith(...subs.flatMap(u => [...u.children])); did = true; }
      else if (!li.textContent.trim() && li.parentNode.children.length > 1 && !li.querySelector('img,input')) { li.remove(); did = true; }
    });
    $$('ul,ol', doc).filter(l => mine(l) && !l.closest('.fig,.dg,.note-log') && !l.querySelector('li')).forEach(l => { l.remove(); did = true; });
    if (!did) break;
  }
}
function liftLists() { for (let i = 0; i < 8 && listItems().length; i++) if (!listShift(-1)) break; }
/* Whether the selection is in or touches a code block, where text formatting and lists do not apply. */
function selCode() { const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return false; const r = s.getRangeAt(0); if (blockOf(r.startContainer) || blockOf(r.endContainer)) return true; return !r.collapsed && $$('pre', doc).some(p => !p.closest('.fig,.dg') && r.intersectsNode(p)); }
/* Bold in text that is heavier by its style (headings, Q&A questions, header cells): the browser would take it for bold
   already and wrap it in a "not bold" style. For the command the text counts as plain, so Bold adds <b> (700) and takes it off again. */
function plainWeight(fn) { const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null; const ws = r ? $$(WEIGHTED, doc).filter(e => !e.closest('.fig,.dg') && r.intersectsNode(e)) : []; ws.forEach(e => e.style.fontWeight = '400'); try { return fn(); } finally { ws.forEach(e => { e.style.removeProperty('font-weight'); if (!e.getAttribute('style')) e.removeAttribute('style'); }); } }
/* Whether the whole selection is in text that is already bold by its style: headings, Q&A questions, header cells, box labels. */
function selWeighted() { const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return false; const r = s.getRangeAt(0), w = n => { if (n.nodeType !== 1) n = n.parentElement; return !!(n && n.closest(WEIGHTED)); }; return w(r.startContainer) && w(r.endContainer); }
/* Lists in a table cell, where a Markdown file cannot hold them: off while a Markdown file is open. */
function mdCellSel() { if (!document.documentElement.classList.contains('md-mode')) return false; const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return false; const r = s.getRangeAt(0), c = n => { if (n.nodeType !== 1) n = n.parentElement; return !!(n && n.closest('td,th')); }; return c(r.startContainer) || c(r.endContainer) || $$('td,th', doc).some(x => r.intersectsNode(x)); }
const MD_CELL_OFF = ['ul', 'ol', 'check'];
const CODE_OFF = ['bold', 'italic', 'ul', 'ol', 'check', 'tag', 'qa', 'ldense', 'olstart', 'indent', 'outdent', 'link'];
/* The caret, so it can be put back after tidy() moves nodes. It is held two ways: as a place in its own block (the block,
   and a count of characters and line breaks from the block's start), which also tells an empty line from the end of the
   line before it; and as a count of characters from the start of the document, for when that block is gone. */
const CARET_BLOCK = 'p,h1,h2,h3,h4,li,td,th,dt,dd,pre,div';
function caretGet() {
  const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode) || !doc.contains(s.focusNode)) return null;
  const at = (n, o) => { const r = document.createRange(); r.setStart(doc, 0); try { r.setEnd(n, o); } catch (e) { return -1; } return r.toString().length; };
  const inBlock = (n, o) => { const e = n.nodeType === 1 ? n : n.parentElement, b = e && e.closest(CARET_BLOCK); if (!b || b === doc || !doc.contains(b)) return null; const r = document.createRange(); try { r.setStart(b, 0); r.setEnd(n, o); } catch (x) { return null; } return [b, r.toString().length + r.cloneContents().querySelectorAll('br').length]; };
  return [at(s.anchorNode, s.anchorOffset), at(s.focusNode, s.focusOffset), inBlock(s.anchorNode, s.anchorOffset), inBlock(s.focusNode, s.focusOffset)];
}
function caretPut(c) {
  if (!c || c[0] < 0) return; const find = k => { const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); let n, last = null; while ((n = w.nextNode())) { if (n.parentElement.closest('.fig,.dg,.note-log')) continue; if (k <= n.length) return [n, k]; k -= n.length; last = n; } return last ? [last, last.length] : null; };
  const inBlock = p => { if (!p || !doc.contains(p[0])) return null; let k = p[1], end = [p[0], 0], n; const w = document.createTreeWalker(p[0], NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT); while ((n = w.nextNode())) { if (n.nodeType === 3) { if (k <= n.length) return [n, k]; k -= n.length; end = [n, n.length]; } else if (n.nodeName === 'BR') { const i = [...n.parentNode.childNodes].indexOf(n); if (!k) return [n.parentNode, i]; k--; end = [n.parentNode, i + 1]; } } return end; };
  const a = inBlock(c[2]) || find(c[0]), f = inBlock(c[3]) || find(c[1]); if (!a || !f) return; try { getSelection().setBaseAndExtent(a[0], a[1], f[0], f[1]); lastRange = getSelection().getRangeAt(0).cloneRange(); } catch (e) { }
}
const TIDY_INLINE = 'b,strong,i,em,a,code,sup,sub,s,strike,del,u,span,mark,kbd';
const TIDY_Q = ['pre *:not(br)', 'span:not([class])', 'font', ':is(' + TIDY_INLINE + ',p,h1,h2,h3,h4,li,dt,dd)[style]', '[style=""]', ':is(p,h1,h2,h3,h4) > :is(ul,ol,dl,table,pre,div,hr,p,h1,h2,h3,h4)', 'li > :is(table,div.tw,pre,dl,div.box,hr,h1,h2,h3,h4)', 'li:not(ul > li, ol > li)', ':is(dt,dd):not(dl > *)', 'dl > :not(dt,dd)', ':is(ul,ol) > :not(li)', 'span.id span.id', 'span.pill span.pill', ':is(b,strong,i,em,code,sup,sub,s,strike,del,u,mark,kbd,span.id,span.pill,a:not(.link-card)):empty', ':is(i,em) :is(i,em)', ':is(b,strong) :is(b,strong)', ':is(s,strike,del) :is(s,strike,del)', 'sup sup', 'sub sub', 'code code', 'a a', ':is(b,strong,i,em,s,strike,del,sup,sub,code,u,mark) + :is(b,strong,i,em,s,strike,del,sup,sub,code,u,mark)',
  ':is(table,thead,tbody,tfoot) > :not(thead,tbody,tfoot,tr,caption,colgroup,col)', 'tr > :not(td,th)'].join(',');
function tidy() {
  const out = n => !!n.closest('.dg,.fig,.wb-board,.note-log,.link-card,svg') || !doc.contains(n);
  if (!$$(TIDY_Q, doc).some(n => !out(n)) && ![...doc.childNodes].some(n => n.nodeType === 3 && n.data.trim())) return false;
  const c = caretGet(), all = q => $$(q, doc).filter(n => !out(n)), unwrap = e => e.replaceWith(...e.childNodes), rename = (e, tag) => { const n = document.createElement(tag); n.append(...e.childNodes); e.replaceWith(n); return n; };
  // Q&A items outside a Q&A list: list items in a list, paragraphs elsewhere
  all(':is(dt,dd):not(dl > *)').forEach(e => rename(e, e.parentNode.matches('ul,ol') ? 'li' : 'p'));
  // anything but Q&A items in a Q&A list goes after it, and the Q&A list carries on after that
  all('dl > :not(dt,dd)').forEach(x => { const dl = x.parentNode; if (!dl) return; const rest = []; for (let k = x.nextSibling; k; k = k.nextSibling) rest.push(k); dl.after(x); if (rest.some(k => k.nodeType === 1)) { const d2 = dl.cloneNode(false); d2.append(...rest); x.after(d2); } if (!dl.children.length) dl.remove(); });
  // list items outside a list are put in one; a list holds only list items
  all('li:not(ul > li, ol > li)').forEach(li => { if (!li.parentNode) return; const prev = li.previousElementSibling; if (prev && prev.matches('ul:not(.check)') && prev.lastElementChild === prev.lastChild) prev.appendChild(li); else { const u = document.createElement('ul'); li.replaceWith(u); u.appendChild(li); } });
  all(':is(ul,ol) > :not(li)').forEach(x => { const L = x.parentNode; if (!L) return; if (x.matches('input')) return; const prev = x.previousElementSibling; if (x.matches('ul,ol') && prev && prev.tagName === 'LI') prev.appendChild(x); else { const li = document.createElement('li'); x.replaceWith(li); li.appendChild(x); } });
  // a paragraph or heading holding a block is split around it
  for (let k = 0; k < 20; k++) {
    const x = all(':is(p,h1,h2,h3,h4) > :is(ul,ol,dl,table,pre,div,hr,p,h1,h2,h3,h4)')[0]; if (!x) break;
    const b = x.parentNode, tail = b.cloneNode(false); tail.removeAttribute('id'); for (let n = x.nextSibling; n; n = x.nextSibling) tail.appendChild(n);
    b.after(x); if (tail.textContent.trim() || tail.querySelector('img,br')) x.after(tail); if (!b.textContent.trim() && !b.querySelector('img')) b.remove();
  }
  // a table, code block, box, Q&A list, divider or heading that a list command took into a list item goes back after the list
  for (let k = 0; k < 20; k++) {
    const x = all('li > :is(table,div.tw,pre,dl,div.box,hr,h1,h2,h3,h4)')[0]; if (!x) break;
    let li = x.parentNode, L = li.parentNode; while (L.parentNode && L.parentNode.tagName === 'LI' && L.parentNode.parentNode.matches('ul,ol')) { li = L.parentNode; L = li.parentNode; }
    const rest = []; for (let n = li.nextSibling; n; n = n.nextSibling) rest.push(n);
    L.after(x); if (rest.some(n => n.nodeType === 1)) { const L2 = L.cloneNode(false); L2.removeAttribute('start'); L2.append(...rest); x.after(L2); }
    const box = x.previousSibling; if (box && box.matches && box.matches('ul,ol') && !box.querySelector('li')) box.remove();
  }
  // a code block holds plain text
  all('pre').filter(p => p.querySelector('*:not(br)')).forEach(pre => { let s = ''; const walk = n => n.childNodes.forEach(k => { if (k.nodeType === 3) s += k.data; else if (k.nodeName === 'BR') s += '\n'; else if (k.nodeType === 1) { walk(k); if (/^(LI|P|DIV|H[1-6]|DT|DD|TR)$/.test(k.nodeName) && !s.endsWith('\n')) s += '\n'; } }); walk(pre); pre.textContent = s.replace(/\n$/, ''); });
  // styling left by the browser's own commands
  all('span:not([class]), font').forEach(unwrap);
  all(':is(' + TIDY_INLINE + ',p,h1,h2,h3,h4,li,dt,dd)[style]').forEach(e => e.removeAttribute('style'));
  all('[style=""]').forEach(e => e.removeAttribute('style'));
  // an ID tag inside an ID tag is one tag; formatting with nothing in it goes (unless the cursor is in it, about to type)
  all('span.id span.id, span.pill span.pill').forEach(unwrap);
  // the same formatting twice side by side is one run of it
  all('b,strong,i,em,s,strike,del,sup,sub,code,u,mark').forEach(e => { const n = e.nextSibling; if (n && n.nodeType === 1 && n.tagName === e.tagName && !n.attributes.length && !e.attributes.length) { e.append(...n.childNodes); n.remove(); } });
  all(':is(i,em) :is(i,em), :is(b,strong) :is(b,strong), :is(s,strike,del) :is(s,strike,del), sup sup, sub sub, code code, a a').forEach(unwrap);   // the same formatting twice is once
  // in a table only rows and cells: anything else the browser put there gives up its content to the cells, or goes
  all(':is(table,thead,tbody,tfoot) > :not(thead,tbody,tfoot,tr,caption,colgroup,col), tr > :not(td,th)').reverse().forEach(x => { if (x.querySelector('td,th,tr')) unwrap(x); else x.remove(); });
  { const s = getSelection(), a = s.rangeCount ? s.anchorNode : null; all(':is(b,strong,i,em,code,sup,sub,s,strike,del,u,mark,kbd,span.id,span.pill,a:not(.link-card)):empty').forEach(e => { if (a !== e) e.remove(); }); }
  // loose text at the top level becomes a paragraph
  let run = null; [...doc.childNodes].forEach(n => { const inline = n.nodeType === 3 ? !!n.data.trim() || !!run : n.nodeType === 1 && n.matches(TIDY_INLINE + ',br,img'); if (!inline) { run = null; return; } if (!run) { run = document.createElement('p'); n.before(run); } run.appendChild(n); });
  doc.normalize(); caretPut(c); return true;
}
/* A code block's text, with each line break (<br>, as copied and pasted code has them) as a new line. */
function preText(n) { let s = ''; const walk = x => x.childNodes.forEach(k => { if (k.nodeType === 3) s += k.data; else if (k.nodeName === 'BR') s += '\n'; else if (k.nodeType === 1 && k.nodeName !== 'INPUT') walk(k); }); walk(n); return s; }
function blockOf(n) { if (!n) return null; if (n.nodeType !== 1) n = n.parentElement; const p = n && n.closest('pre'); return p && doc.contains(p) && !p.closest('.fig,.dg') ? p : null; }
function lastLine(nodes) { let t = ''; for (const n of nodes.reverse()) { if (n.nodeName === 'BR') break; if (n.nodeType === 3) { const i = n.data.lastIndexOf('\n'); if (i >= 0) { t = n.data.slice(i + 1) + t; break; } t = n.data + t; } } return t.trim(); }
function codeEnter(pre) {
  const r = getSelection().getRangeAt(0);
  const after = document.createRange(); after.setStart(r.endContainer, r.endOffset); after.setEnd(pre, pre.childNodes.length);
  const before = document.createRange(); before.setStart(pre, 0); before.setEnd(r.startContainer, r.startOffset);
  if (after.toString().replace(/\n/g, '').trim() || lastLine(frag(before)) || !pre.textContent.trim()) { document.execCommand('insertLineBreak'); touch(); return; }
  for (let n = pre.lastChild; n; n = pre.lastChild) {
    if (n.nodeName === 'BR') { n.remove(); continue; }
    if (n.nodeType === 3) { const t = n.data.replace(/[ \t]*\n[ \t]*$/, ''); if (t !== n.data) { if (t) { n.data = t; continue; } n.remove(); continue; } if (!n.data.trim()) { n.remove(); continue; } }
    break;
  }
  const p = mk('p'); pre.after(p); caret(p); touch(); styleUI();
}
function codeInsert(text) {
  const sel = getSelection(); if (!sel.rangeCount) return; const r = sel.getRangeAt(0); r.deleteContents();
  const f = document.createDocumentFragment(); let lastNode = null;
  text.split(/\r?\n/).forEach((t, i) => { if (i) f.appendChild(lastNode = document.createElement('br')); if (t) f.appendChild(lastNode = document.createTextNode(t)); });
  if (!lastNode) return; r.insertNode(f);
  const pre = blockOf(lastNode); if (lastNode.nodeName === 'BR' && pre && !lastNode.nextSibling) lastNode.after(document.createElement('br'));
  const c = document.createRange(); c.setStartAfter(lastNode); c.collapse(true); sel.removeAllRanges(); sel.addRange(c); lastRange = c.cloneRange(); touch();
}
function styledParaEnd() {
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return null; let n = s.anchorNode; if (n && n.nodeType !== 1) n = n.parentElement;
  const p = n && n.closest('p.sub,p.h2sub,p.cap,p.bluf'); if (!p || !doc.contains(p) || p.closest('.fig,.dg,td,th')) return null;
  const r = document.createRange(); r.setStart(s.anchorNode, s.anchorOffset); r.setEnd(p, p.childNodes.length); return r.toString().trim() ? null : p;
}
const SAFE_URL = /^(https?:\/\/|mailto:|tel:|#|\/|\.{0,2}\/|[^:]*$)/i;
/* The Link button opens a small form: display text and address. On a link it edits that link. Otherwise the display
   text starts as the selected text, and the address starts as the selected text when that is a web address, or else
   as the clipboard when it holds one. The clipboard is read only when the browser has already allowed it, so pressing
   the button never brings up a permission prompt. */
const WEB_URL = /^https?:\/\/\S+$/i;
let linkJob = null;
function editLink() {
  live(); const r = lastRange; if (!r || !doc.contains(r.startContainer)) return; let n = r.startContainer; if (n.nodeType !== 1) n = n.parentElement; if (n.closest('.fig,.dg')) return;
  const a = n.closest('a:not(.link-card)'), B = 'p,h1,h2,h3,h4,pre,dt,dd,li,td,th', blockAt = x => { if (x.nodeType !== 1) x = x.parentElement; return x.closest(B); };
  const sel = a || r.collapsed ? '' : r.toString(), one = !!a || r.collapsed || (blockAt(r.startContainer) === blockAt(r.endContainer) && !/[\r\n]/.test(sel));
  const d = $('#linkdlg'), T = $('#link-text'), U = $('#link-url'), picked = WEB_URL.test(sel.trim());
  linkJob = { a, sel, one };
  $('#link-h').textContent = a ? 'Edit link' : 'Add link'; $('#link-err').textContent = ''; $('[data-a="linkremove"]', d).hidden = !a;
  T.disabled = !one; T.value = a ? a.textContent : one ? sel : ''; T.placeholder = one ? 'Shown in the document; left empty, the address is shown' : 'The selected text is kept as it is';
  U.value = a ? a.getAttribute('href') || '' : picked ? sel.trim() : 'https://';
  d.showModal(); U.focus(); U.select();
  if (!a && !picked) { const job = linkJob; try { navigator.permissions.query({ name: 'clipboard-read' }).then(p => p.state === 'granted' ? navigator.clipboard.readText() : '').then(t => { t = (t || '').trim(); if (WEB_URL.test(t) && linkJob === job && d.open && U.value === 'https://') { U.value = t; U.select(); } }).catch(() => { }); } catch (e) { } }
}
function linkDone(how) {
  const d = $('#linkdlg'), job = linkJob; if (!job) { d.close(); return; }
  const finish = () => { linkJob = null; d.close(); restore(); };
  if (how === 'cancel') { finish(); return; }
  let v = $('#link-url').value.trim(); const text = $('#link-text').value.trim(); if (how === 'remove') v = '';
  if (!v || v === 'https://' || v === 'http://') { if (!job.a) { $('#link-err').textContent = 'Enter an address.'; return; } const a = job.a; finish(); a.replaceWith(...a.childNodes); touch(); return; }
  if (!SAFE_URL.test(v)) { $('#link-err').textContent = 'Links can be web addresses (https://), email (mailto:), phone (tel:) or a place in this document (#).'; return; }
  finish();
  if (job.a) { job.a.setAttribute('href', v); if (text && text !== job.a.textContent) job.a.textContent = text; }
  else if (!getSelection().isCollapsed && (!job.one || !text || text === job.sel.trim() || text === job.sel)) document.execCommand('createLink', false, v); // the selected text is kept with its formatting
  else document.execCommand('insertHTML', false, '<a href="' + esc(v) + '">' + esc(text || v) + '</a>');
  touch();
}
$('#linkdlg').addEventListener('click', e => { const b2 = e.target.closest('button[data-a]'); if (b2) linkDone({ linksave: 'save', linkremove: 'remove', linkcancel: 'cancel' }[b2.dataset.a]); });
$('#linkdlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); linkDone('save'); } });
$('#linkdlg').addEventListener('cancel', e => { e.preventDefault(); linkDone('cancel'); });
/* ---------- notes ----------
   A note covers whole blocks. Nothing is drawn in the document: the margin (shown when it is switched on and there are notes) has a bold
   bar beside the noted blocks and a note icon at its top. Clicking the icon opens the log over the margin without moving
   the page. The log is dated lines, "2026.11.15", then "AB comment" lines. Everything in it is editable. Adding to a note
   on a date it already has adds a line under that date. A note with no comment text left is removed once the cursor
   leaves it; its blocks stay. Logs are always closed when a document opens and their open state is never saved. */
const today = () => { const d = new Date(), z = n => String(n).padStart(2, '0'); return d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate()); };
function initials(ask) {
  let v = ''; try { v = localStorage.getItem('fle-initials') || ''; } catch (e) { }
  if (!v || ask) { const a = prompt('Your initials, stamped on the notes you add (kept in this browser only)', v || ''); if (a === null) return v || null; v = a.trim().toUpperCase().slice(0, 6); try { localStorage.setItem('fle-initials', v); } catch (e) { } }
  whoUI(); return v || null;
}
function whoUI() { let v = ''; try { v = localStorage.getItem('fle-initials') || ''; } catch (e) { } const b = $('#who'); if (b) { b.dataset.initials = v; b.classList.toggle('on', !!v); } }
function topOf(n) { if (n && n.nodeType !== 1) n = n.parentElement; while (n && n.parentNode !== doc) n = n.parentNode; return n; }
const NOTE_ICON = '<summary contenteditable="false" title="Note" aria-label="Note"></summary>';
function noteParts(note) { const log = $(':scope > .note-log', note); return { body: $(':scope > .note-body', note), log, list: log && $(':scope > .note-entries', log) }; }
function makeNote() { return el('<div class="note"><div class="note-body"></div><details class="note-log">' + NOTE_ICON + '<div class="note-entries"></div></details></div>'); }
/* Notes in the earlier form (box and side log with "AB 2026.11.15" stamps) become the current form. */
function upgradeNotes(root) {
  $$('.note', root).forEach(n => {
    const old = $(':scope > aside.note-log', n); if (!old) return;
    const d = el('<details class="note-log">' + NOTE_ICON + '<div class="note-entries"></div></details>'), list = d.lastChild; let who = '';
    [...old.children].forEach(p => {
      if (p.classList.contains('note-stamp')) { const m = p.textContent.trim().match(/^(\S+)\s+(\d{4}\.\d{2}\.\d{2})$/); who = m ? m[1] : ''; const dt = mk('p', 'note-date', ''); dt.innerHTML = '<b></b>'; dt.firstChild.textContent = m ? m[2] : p.textContent.trim(); list.appendChild(dt); }
      else if (p.textContent.trim()) { const l = mk('p', '', ''); l.innerHTML = '<b class="note-who"></b> '; l.firstChild.textContent = who; l.append(...p.childNodes); list.appendChild(l); }
    });
    old.replaceWith(d);
  });
  $$('.note-log', root).forEach(d => { d.removeAttribute('open'); const sm = $(':scope > summary', d); if (sm) { sm.innerHTML = ''; sm.setAttribute('contenteditable', 'false'); sm.setAttribute('title', 'Note'); sm.setAttribute('aria-label', 'Note'); } });   // the button is drawn by the style sheet: its name is for screen readers
}
function openLog(note, on) {
  $$('.note-log[open]', doc).forEach(d => { if (d.parentNode !== note || !on) d.removeAttribute('open'); });
  if (note && on) noteParts(note).log.setAttribute('open', '');
}
function addEntry(note) {
  const who = initials(); if (!who) return;
  const { list } = noteParts(note), date = today();
  const dates = $$('.note-date', list), last = dates[dates.length - 1];
  if (!last || last.textContent.trim() !== date) { const dt = mk('p', 'note-date', '<b></b>'); dt.firstChild.textContent = date; list.appendChild(dt); }
  const line = mk('p', '', '<b class="note-who"></b>&nbsp;'); line.firstChild.textContent = who; list.appendChild(line);
  openLog(note, true); caret(line, true); touch(); styleUI();
}
function addNote() {
  live(); let a, b;
  if (dgSel) { a = b = topOf(dgSel); dgSelect(null); }
  else if (lastRange && doc.contains(lastRange.startContainer)) { a = topOf(lastRange.startContainer); b = topOf(lastRange.endContainer); }
  if (!a || !b) { alert('Place the cursor in the document, or select the blocks to note.'); return; }
  if (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_PRECEDING) [a, b] = [b, a];
  const blocks = []; for (let n = a; n; n = n.nextElementSibling) { blocks.push(n); if (n === b) break; }
  let note;
  if (blocks.length === 1 && blocks[0].classList.contains('note')) note = blocks[0];
  else {
    note = makeNote(); const { body, list } = noteParts(note); a.before(note);
    blocks.forEach(x => { if (x.classList.contains('note')) { const p = noteParts(x); body.append(...p.body.childNodes); list.append(...p.list.childNodes); x.remove(); } else body.appendChild(x); });
  }
  setNotes(true); addEntry(note);
}
function noteEmpty(note) { const { list } = noteParts(note); if (!list) return true; return !$$('p:not(.note-date)', list).some(p => { const c = p.cloneNode(true); $$('.note-who', c).forEach(w => w.remove()); return c.textContent.trim(); }); }
function unwrapNote(note) { const { body } = noteParts(note); note.replaceWith(...(body ? body.childNodes : [])); }
function tidyNotes(keepCaret) {
  let here = null; if (keepCaret) { const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) { const n = s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement; here = n && n.closest('.note'); } }
  let changed = false; $$('.note', doc).forEach(n => { if (n !== here && noteEmpty(n)) { unwrapNote(n); changed = true; } });
  $$('.note', doc).forEach(n => { const { body } = noteParts(n); if (body && !body.children.length) body.appendChild(mk('p')); });
  return changed;
}
doc.addEventListener('click', e => {
  const sm = e.target.closest && e.target.closest('.note-log > summary'); if (!sm || !doc.contains(sm)) return;
  e.preventDefault(); const note = sm.closest('.note'), open = !noteParts(note).log.hasAttribute('open'); openLog(note, open);
  if (open) { const { list } = noteParts(note); const last = list.lastElementChild; if (last) caret(last, true); }
}, true);
doc.addEventListener('mousedown', e => { if (e.target.closest && e.target.closest('.note-log > summary')) e.preventDefault(); });
document.addEventListener('pointerdown', e => { if (dgSel && e.target.closest && !e.target.closest('#chrome, #de-overlay, #dm-overlay') && !doc.contains(e.target)) dgSelect(null); }, true);   // a click beside the page, not only on it
document.addEventListener('pointerdown', e => { if (!e.target.closest || e.target.closest('.note-log') || e.target.closest('#chrome')) return; if ($('.note-log[open]', doc)) openLog(null, false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('.note-log[open]', doc)) { const s = getSelection(); let n = s.anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; const note = n && n.closest('.note'); openLog(null, false); if (note) caret(noteParts(note).body.firstElementChild || noteParts(note).body, false); } });
window.addEventListener('beforeprint', () => $$('.note-log', doc).forEach(d => d.setAttribute('open', '')));
window.addEventListener('afterprint', () => openLog(null, false));
function notesIn(root) { return $$('.note', root).length; }
/* The notes margin is hidden unless it is switched on, even when the document has notes. The choice is saved with the
   document (class notes-on on main), so a saved document shows its notes only if it was saved with the margin on. */
function setNotes(on) { showNotes = !!on; doc.classList.toggle('notes-on', showNotes); if (!showNotes) openLog(null, false); notesUI(); }
function notesUI() {
  const b = $('[data-a="margin"]'); if (!b) return; const n = notesIn(doc);
  b.classList.toggle('on', showNotes); b.classList.toggle('has', !showNotes && n > 0); b.setAttribute('aria-pressed', String(showNotes));
  b.title = (showNotes ? 'Hide the notes margin' : 'Show the notes margin') + ' (' + (n === 1 ? '1 note' : n + ' notes') + ' in this document; saved with the document)';
}
function toggleNotes() { setNotes(!showNotes); fit(); dirty = true; status(); }
function addCode() { const pre = mk('pre'); insertBlock(pre); caret(pre); styleUI(); }
/* Divider: a horizontal rule where the cursor is, like the other inserts. Typing carries on in the block after it, or in a new
   empty paragraph when what follows is not one to type in. In a Markdown file it is saved as ---. */
function addDivider() {
  const b = curBlock(), was = b ? b.nextElementSibling : null, hr = document.createElement('hr'); placeBlock(hr);
  let nx = hr.nextElementSibling;
  /* the cursor's own block, or the second half of it, follows the line: carry on there; otherwise an empty paragraph, made if need be */
  const own = nx && nx !== was && nx.matches('p,h2,h3,h4'), empty = nx && nx.matches('p') && !nx.className && !hasContent(nx);
  if (!own && !empty) { nx = mk('p'); hr.after(nx); }
  caret(nx); touch(); styleUI();
}
const INLINE = 'b,strong,i,em,u,s,strike,del,ins,span,a,font,code,kbd,samp,tt,var,mark,small,big,sub,sup';
/* Clear format. With the cursor only, or when a block is wholly selected, the block loses its inline formatting and
   becomes a plain paragraph (list items and cells stay what they are). With part of a block selected, only the selected
   text loses its inline formatting and the block style stays. Links and ID tags are never removed. */
const clearable = e => !e.matches('a,span.id') && !e.closest('.fig,.dg,[class*="wb-"]') && !e.matches('[class*="wb-"]') && !e.querySelector('svg,img');
/* A paragraph or heading that sits inside a table cell or list item becomes a plain line there: its content stays in
   place, with a line break where it would otherwise run into the text beside it. Returns the cell or item. */
function toLine(b) {
  const par = b.parentNode, real = (n, step) => { while (n && (n.nodeType === 8 || (n.nodeType === 3 && !n.data.trim()))) n = n[step]; return n; };
  const flows = n => !!n && n.nodeName !== 'BR' && !(n.nodeType === 1 && n.matches(BLOCKS + ',li,input'));
  const kids = [...b.childNodes]; while (kids.length && kids[kids.length - 1].nodeName === 'BR') kids.pop();
  if (flows(real(b.previousSibling, 'previousSibling'))) b.before(document.createElement('br'));
  if (flows(real(b.nextSibling, 'nextSibling')) && kids.length) kids.push(document.createElement('br'));
  b.replaceWith(...kids); return par;
}
function clearPart(b, ir) {
  const frag = ir.extractContents(); let at = ir.startContainer, off = ir.startOffset;
  const keep = []; let top = null;
  for (let n = at.nodeType === 1 ? at : at.parentNode; n && n !== b; n = n.parentNode) { top = n; if (n.matches('a,span.id')) keep.push(n); }
  if (top) {
    const tail = document.createRange(); tail.setStart(at, off); tail.setEndAfter(top); const rest = tail.extractContents();
    top.after(rest); at = top.parentNode; off = [...at.childNodes].indexOf(top) + 1;
    [top, top.nextSibling].forEach(x => { if (x && x.nodeType === 1 && x.matches(INLINE) && !x.textContent && !x.querySelector('img,svg,br')) { if (x === top) off--; x.remove(); } });
  }
  const box = document.createElement('div'); box.appendChild(frag);
  $$(INLINE, box).filter(clearable).reverse().forEach(e => e.replaceWith(...e.childNodes));
  keep.forEach(k => { const w = k.cloneNode(false); w.append(...box.childNodes); box.appendChild(w); });
  const nodes = [...box.childNodes]; if (!nodes.length) return null;
  const ins = document.createRange(); ins.setStart(at, off); ins.collapse(true); const f = document.createDocumentFragment(); f.append(...nodes); ins.insertNode(f);
  $$(INLINE, b).reverse().forEach(e => { if (!e.textContent && !e.querySelector('img,svg,br') && !e.closest('.fig,.dg')) e.remove(); });
  b.normalize(); const out = document.createRange();
  const first = nodes.find(n => n.isConnected), lastN = [...nodes].reverse().find(n => n.isConnected);
  if (first && lastN) { out.setStartBefore(first); out.setEndAfter(lastN); return out; }
  return null;
}
function clearFormat() {
  live(); const r = lastRange; if (!r) return;
  const B = 'p,h1,h2,h3,h4,pre,dt,dd,li,td,th';
  let blocks = $$(B, doc).filter(b => !b.closest('.fig,.dg') && r.intersectsNode(b) && !$(B, b));
  if (!r.collapsed && r.endOffset === 0 && blocks.length > 1 && blocks[blocks.length - 1].contains(r.endContainer)) blocks.pop();
  const txt = t => t.replace(/[\s\u00a0\u200b]+/g, '');
  const jobs = blocks.map(b => {
    const ir = document.createRange(); ir.selectNodeContents(b);
    if (b.contains(r.startContainer)) ir.setStart(r.startContainer, r.startOffset);
    if (b.contains(r.endContainer)) ir.setEnd(r.endContainer, r.endOffset);
    return { b, ir, whole: r.collapsed || txt(ir.toString()) === txt(b.textContent) };
  });
  // text that sits directly in a cell or list item, beside its lists and headings, is not in a block of its own: find those runs
  const runs = [], isBlock = n => n.nodeType === 1 && n.matches(B + ',ul,ol,dl,table,div,input');
  $$('td,th,li,dd', doc).filter(c => !c.closest('.fig,.dg') && $(B, c) && r.intersectsNode(c)).forEach(c => {
    let run = []; const end = () => {
      if (run.some(n => n.nodeType === 1 ? n.nodeName !== 'BR' : n.data.trim())) {
        const rr = document.createRange(); rr.setStartBefore(run[0]); rr.setEndAfter(run[run.length - 1]);
        if (rr.comparePoint(r.endContainer, r.endOffset) >= 0 && rr.comparePoint(r.startContainer, r.startOffset) <= 0) {
          const ir = rr.cloneRange(); if (rr.comparePoint(r.startContainer, r.startOffset) === 0) ir.setStart(r.startContainer, r.startOffset); if (rr.comparePoint(r.endContainer, r.endOffset) === 0) ir.setEnd(r.endContainer, r.endOffset);
          if (r.collapsed || txt(ir.toString())) runs.push({ c, nodes: run.slice(), ir, whole: r.collapsed || txt(ir.toString()) === txt(rr.toString()) });
        }
      }
      run = [];
    };
    [...c.childNodes].forEach(n => { if (isBlock(n)) end(); else run.push(n); }); end();
  });
  if (!blocks.length && !runs.length) return;
  // the selection is kept, ready for the next toolbar choice: two markers hold its ends while the blocks under it are rebuilt
  const mark = r.collapsed ? null : [document.createComment('s'), document.createComment('e')];
  if (mark) { const z = r.cloneRange(); z.collapse(false); z.insertNode(mark[1]); const a0 = r.cloneRange(); a0.collapse(true); a0.insertNode(mark[0]); }
  const dls = new Set(); let last = null, picked = null;
  runs.forEach(({ c, nodes, ir, whole }) => {
    if (!whole) { const o = clearPart(c, ir); if (!jobs.length && runs.length === 1) picked = o; last = c; return; }
    nodes.filter(n => n.nodeType === 1).forEach(n => { $$(INLINE, n).filter(clearable).reverse().forEach(e => e.replaceWith(...e.childNodes)); if (n.matches(INLINE) && clearable(n)) n.replaceWith(...n.childNodes); });
    last = c;
  });
  jobs.forEach(({ b, ir, whole }) => {
    if (!whole) { if (b.matches('pre')) { last = b; return; } const o = clearPart(b, ir); if (jobs.length === 1) picked = o; last = b; return; }
    $$(INLINE, b).filter(clearable).reverse().forEach(e => e.replaceWith(...e.childNodes));
    b.removeAttribute('style');
    if (b.matches('li,td,th')) { last = b; return; }
    if (b.matches('p,h1,h2,h3,h4') && b.parentNode.closest('td,th,li')) { last = toLine(b); return; } // in a cell or list item: a plain line, not a paragraph
    if (b.matches('pre')) [...b.childNodes].filter(n => n.nodeType === 3 && n.data.includes('\n')).forEach(n => { const f = document.createDocumentFragment(); n.data.replace(/\n$/, '').split('\n').forEach((t, i) => { if (i) f.appendChild(document.createElement('br')); f.appendChild(document.createTextNode(t)); }); n.replaceWith(f); });
    if (b.matches('dt,dd')) dls.add(b.parentNode);
    const p = document.createElement('p'); p.append(...b.childNodes); if (!p.childNodes.length) p.innerHTML = '<br>'; b.replaceWith(p); last = p;
  });
  dls.forEach(dl => {
    const parts = []; let cur = null;
    [...dl.children].forEach(c => { if (c.tagName === 'P') { parts.push(c); cur = null; } else { if (!cur) { cur = mk('dl', 'qa', ''); parts.push(cur); } cur.appendChild(c); } });
    dl.replaceWith(...parts);
  });
  let kept = picked;
  if (mark) {
    if (!kept && doc.contains(mark[0]) && doc.contains(mark[1])) { kept = document.createRange(); kept.setStartAfter(mark[0]); kept.setEndBefore(mark[1]); }
    mark.forEach(m => { const p = m.parentNode; m.remove(); if (p) p.normalize(); });
    if (kept && (kept.collapsed || !doc.contains(kept.startContainer))) kept = null;
  }
  if (kept) { const g = getSelection(); g.removeAllRanges(); g.addRange(kept); lastRange = kept.cloneRange(); } else if (last) caret(last, true);
  touch(); styleUI();
}
/* A new block goes where the cursor is. An empty paragraph is replaced by it. With the cursor in a paragraph or heading it
   goes before that (cursor at the start), after it (cursor at the end) or between its two halves. With text selected it goes
   after the block the selection starts in. A list, table, Q&A list or code block cannot hold it, so there it goes after that;
   with no cursor it goes at the end of the page. It never goes between the title and its subtitle. */
function placeBlock(node) {
  let b = curBlock(); const r = lastRange; if (!b) { doc.appendChild(node); return; }
  if (b.tagName === 'H1') { if (b.nextElementSibling && b.nextElementSibling.matches('p.sub')) b = b.nextElementSibling; b.after(node); return; }
  if (!r || !r.collapsed || !b.matches('p,h2,h3,h4') || b.matches('p.box-h') || !b.contains(r.startContainer)) { b.after(node); return; }
  if (b.tagName === 'P' && !b.className && !hasContent(b)) { b.replaceWith(node); return; }
  const head = document.createRange(), tail = document.createRange(); head.selectNodeContents(b); head.setEnd(r.startContainer, r.startOffset); tail.selectNodeContents(b); tail.setStart(r.startContainer, r.startOffset);
  const some = x => { const f = x.cloneContents(); return !!(f.textContent.trim() || f.querySelector('img,svg')); };
  if (!some(tail)) b.after(node); else if (!some(head)) b.before(node);
  else { const rest = b.cloneNode(false); rest.removeAttribute('id'); rest.append(tail.extractContents()); b.after(node); node.after(rest); }
}
function insertBlock(node) { placeBlock(node); touch(); }
/* A click in the blank space of the page above, between or below blocks that cannot be typed in (a diagram, a picture, a table)
   makes a paragraph there, so text can always be written before and after them. Beside a block that takes text, the
   browser places the cursor as usual. */
const TYPEABLE = 'p,h1,h2,h3,h4,ul,ol,dl,pre,blockquote';
function gapPara(e) {
  if (e.target !== doc) return false;
  const y = e.clientY, kids = [...doc.children]; let prev = null, next = null;
  for (const k of kids) { const r = k.getBoundingClientRect(); if (r.bottom <= y) prev = k; else if (r.top >= y) { next = k; break; } else return false; }
  if ((prev && prev.matches(TYPEABLE)) || (next && next.matches(TYPEABLE))) return false;
  e.preventDefault(); dgSelect(null); clearTimeout(timer); histSnap();
  const p = mk('p'); if (next) next.before(p); else doc.appendChild(p);
  doc.focus(); caret(p, false); touch(); return true;
}
/* Drag and drop: content dragged within the document moves as usual (it is already clean); anything dropped from
   outside arrives as plain text, and a dropped .html file is opened through the same cleaning as Open. */
let dragInside = false;
doc.addEventListener('dragstart', () => { dragInside = true; });
document.addEventListener('dragend', () => { dragInside = false; });
doc.addEventListener('drop', async e => {
  if (dragInside) { dragInside = false; return; }
  e.preventDefault(); const dt = e.dataTransfer; if (!dt) return;
  const f = dt.files && dt.files[0], it = dt.items && dt.items[0], hp = f && it && it.kind === 'file' && it.getAsFileSystemHandle ? it.getAsFileSystemHandle().catch(() => null) : null;   // asked for at once: the browser gives it only while the drop is handled
  if (f) { if (/\.html?$/i.test(f.name)) { if (!(await gate('open the dropped document'))) return; const h = hp ? await hp : null; handle = h && h.kind === 'file' ? h : null; NB.detach(); load(await withPictures(await f.text()), f.name); } return; }
  const t = dt.getData('text/plain'); if (!t) return;
  const r = document.caretRangeFromPoint && document.caretRangeFromPoint(e.clientX, e.clientY);
  if (r && doc.contains(r.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(r); }
  histSnap(); if (blockOf(getSelection().anchorNode)) codeInsert(t); else document.execCommand('insertText', false, t); touch();
});
doc.addEventListener('beforeinput', e => { if ((e.inputType === 'insertFromDrop' && !dragInside) || e.inputType === 'insertFromPaste' || e.inputType === 'insertFromPasteAsQuotation') { if (e.dataTransfer && e.dataTransfer.types.includes('text/html')) e.preventDefault(); } });
/* ---------- copy format (format painter) ----------
   Press the button with the cursor in the source text: it picks up the block style (Style list value) and bold, italics
   and ID tag at the cursor. Then click in a block to give it the block style, or select text to give it the inline
   formatting as well. One click on the button applies once; a double-click keeps it on until Escape or the button.
   Links, list type and table settings are not copied. List items and table cells take the inline formatting only. */
let paint = null;
function paintUI() { const b = $('[data-a="paint"]'); b.classList.toggle('on', !!paint); b.setAttribute('aria-pressed', String(!!paint)); doc.classList.toggle('ed-paint', !!paint); }
function paintStop() { if (!paint) return; paint = null; paintUI(); }
function paintPick(sticky) {
  live(); let n = lastRange && lastRange.startContainer; if (n && n.nodeType !== 1) n = n.parentElement;
  if (!n || !doc.contains(n) || n.closest('.fig,.dg,.note-log')) { alert('Place the cursor in the text whose format you want to copy first.'); return; }
  const b = n.closest('dt,dd,h1,h2,h3,h4,pre,p,li,td,th'); let block = null;
  if (b && doc.contains(b)) { const t = b.tagName.toLowerCase(); if (t === 'p') block = ['sub', 'h2sub', 'bluf', 'cap'].map(c => b.classList.contains(c) ? 'p.' + c : '').find(Boolean) || 'p'; else if (/^(h[1-4]|pre|dt|dd)$/.test(t)) block = t; }
  const has = sel => { const x = n.closest(sel); return !!(x && (!b || b.contains(x)) && doc.contains(x)); };
  paint = { block, bold: has('b,strong'), italic: has('i,em'), id: has('span.id'), sticky: !!sticky }; paintUI();
}
function paintApply() {
  if (!paint || editing || board) return;
  const s = getSelection(); if (!s.rangeCount) return; let r = s.getRangeAt(0);
  let n = r.startContainer; if (n.nodeType !== 1) n = n.parentElement;
  if (!doc.contains(r.startContainer) || !doc.contains(r.endContainer) || n.closest('.fig,.dg,.note-log')) return;
  clearTimeout(timer); histSnap();
  const B = 'p,h1,h2,h3,h4,pre,dt,dd,li,td,th', P = paint;
  let blocks = $$(B, doc).filter(x => !x.closest('.fig,.dg,.note-log') && r.intersectsNode(x) && !$(B, x));
  if (!r.collapsed && r.endOffset === 0 && blocks.length > 1 && blocks[blocks.length - 1].contains(r.endContainer)) blocks.pop();
  // block style
  if (P.block) {
    const [tag, cls] = P.block.split('.');
    if (tag === 'dt' || tag === 'dd' || blocks.some(x => x.matches('dt,dd'))) { if (blocks.length === 1 && !blocks[0].matches('li,td,th')) { setBlock(P.block); r = getSelection().getRangeAt(0); blocks = $$(B, doc).filter(x => r.intersectsNode(x) && !$(B, x)); } }
    else blocks = blocks.map(x => {
      if (!x.matches('p,h1,h2,h3,h4,pre')) return x;
      let y = x;
      if (x.tagName.toLowerCase() !== tag) {
        if (x.matches('pre')) [...x.childNodes].filter(t => t.nodeType === 3 && t.data.includes('\n')).forEach(t => { const f = document.createDocumentFragment(); t.data.replace(/\n$/, '').split('\n').forEach((v, i) => { if (i) f.appendChild(document.createElement('br')); f.appendChild(document.createTextNode(v)); }); t.replaceWith(f); });
        const at = [r.startContainer, r.startOffset, r.endContainer, r.endOffset]; y = rename(x, tag);
        if (at[0] === x) at[0] = y; if (at[2] === x) at[2] = y;
        try { r = document.createRange(); r.setStart(at[0], at[1]); r.setEnd(at[2], at[3]); } catch (e) { r = document.createRange(); r.selectNodeContents(y); r.collapse(false); }
        s.removeAllRanges(); s.addRange(r);
      }
      if (cls) y.className = cls; else y.removeAttribute('class');
      return y;
    });
  }
  // inline formatting, onto selected text only; code blocks stay plain
  if (!r.collapsed && !blocks.some(x => x.matches('pre'))) {
    const real = sel => blocks.some(x => $$(sel, x).some(e => r.intersectsNode(e)));
    [['bold', 'b,strong', P.bold], ['italic', 'i,em', P.italic]].forEach(([c, sel, want]) => {
      let on = false; try { on = document.queryCommandState(c); } catch (e) { }
      if (want) { if (!on) document.execCommand(c); }
      else if (real(sel)) { document.execCommand(c); if (!on) document.execCommand(c); }
    });
    blocks.forEach(x => $$('span[style]:not([class])', x).forEach(e => e.replaceWith(...e.childNodes)));
    r = getSelection().getRangeAt(0);
    blocks.forEach(x => $$('span.id', x).filter(e => r.intersectsNode(e)).forEach(e => e.replaceWith(...e.childNodes)));
    r = getSelection().getRangeAt(0);
    if (P.id && blocks.length === 1 && r.toString().trim()) { const sp = document.createElement('span'); sp.className = 'id'; sp.textContent = r.toString().trim(); r.deleteContents(); r.insertNode(sp); const c = document.createRange(); c.selectNode(sp); s.removeAllRanges(); s.addRange(c); }
  }
  live(); touch(); styleUI();
  if (!P.sticky) paintStop();
}
doc.addEventListener('mouseup', () => { if (paint) setTimeout(paintApply, 0); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && paint) paintStop(); });
$('[data-a="paint"]').addEventListener('dblclick', () => paintPick(true));

/* ---------- repeat last toolbar command ----------
   Option+Q (Alt+Q on Windows), Option or Alt + click or drag, or the Repeat button, applies the last toolbar command again
   at the cursor or on the selection. Commands that switch something on or off are remembered as the state they left, so
   a repeat sets that state and never toggles. The command is kept until another repeatable one replaces it. */
let lastCmd = null;
const REP_KEY = /Mac|iPhone|iPad/.test(navigator.platform || '') ? 'Option+Q' : 'Alt+Q';
function repUI() { const b = $('[data-a="repeat"]'); if (!b) return; b.classList.toggle('dim', !lastCmd); const t = 'Repeat last toolbar command' + (lastCmd ? ': ' + lastCmd.label : '') + ' (' + REP_KEY + ', or ' + REP_KEY.split('+')[0] + ' + click)'; b.title = t; b.setAttribute('aria-label', t); }
function repSet(label, run) { lastCmd = label ? { label, run } : null; repUI(); }
function setInline(c, sel, want) {
  let on = false; try { on = document.queryCommandState(c); } catch (e) { }
  if (want) { if (!on) document.execCommand(c); return; }
  const s = getSelection(), r = s.rangeCount ? s.getRangeAt(0) : null;
  if (on) document.execCommand(c); else if (r && !r.collapsed && $$(sel, doc).some(e => r.intersectsNode(e))) { document.execCommand(c); document.execCommand(c); }
}
const inTable = () => { live(); return !!cell(); };
const REP = {
  bold: () => { let w = false; try { w = plainWeight(() => document.queryCommandState('bold')); } catch (e) { } return [w ? 'Bold' : 'Bold off', () => { restore(); plainWeight(() => setInline('bold', 'b,strong', w)); }]; },
  italic: () => { let w = false; try { w = document.queryCommandState('italic'); } catch (e) { } return [w ? 'Italic' : 'Italic off', () => { restore(); setInline('italic', 'i,em', w); }]; },
  ul: () => { let w = false; try { w = document.queryCommandState('insertUnorderedList'); } catch (e) { } return [w ? 'Bulleted list' : 'Bulleted list off', () => { if (qaList('ul')) return; if (document.queryCommandState('insertUnorderedList') !== w) listCmd('insertUnorderedList'); }]; },
  ol: () => { let w = false; try { w = document.queryCommandState('insertOrderedList'); } catch (e) { } return [w ? 'Numbered list' : 'Numbered list off', () => { if (qaList('ol')) return; if (document.queryCommandState('insertOrderedList') !== w) listCmd('insertOrderedList'); }]; },
  check: () => { const w = inCheck(); return [w ? 'Checklist' : 'Checklist off', () => { restore(); if (inCheck() !== w) checkList(); }]; },
  ldense: () => { const l = listTop(), w = !!(l && l.classList.contains('dense')); return [w ? 'Compact list' : 'Compact list off', () => { restore(); const t = listTop(); if (t && t.classList.contains('dense') !== w) listDense(); }]; },
  indent: () => ['Indent', () => listShift(1)], outdent: () => ['Outdent', () => listShift(-1)],
  clear: () => ['Clear format', clearFormat],
  ctunwrap: () => ['Unwrap container', () => { live(); const c = lastRange ? ctAt(lastRange.startContainer) : null; if (c) ctUnwrap(c); }],
  note: () => ['Note', addNote], code: () => ['Insert code block', addCode], divider: () => ['Divider', () => { restore(); addDivider(); }], qa: () => { const w = !!qaItem(lastRange); return [w ? 'Q&A question' : 'Q&A off', () => { live(); if (!!qaItem(lastRange) !== w) addQa(); }]; },
  tag: () => ['ID tag', () => { restore(); let n = getSelection().anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; if (n && n.closest('span.id')) return; ACT.tag(); }],
  ...Object.fromEntries([['hr', 'Header row'], ['sr', 'Sub header row'], ['hc', 'Header column'], ['sc', 'Sub header column']].map(([a, name]) => [a, () => { live(); const c = cell(), w = !!(c && tHeaderState(c)[a]); return [w ? name : name + ' off', () => { if (!inTable()) return; if (!!tHeaderState(cell())[a] !== w) tableOp(a); }]; }])),
  dense: () => { live(); const c = cell(), w = !!(c && c.closest('table').classList.contains('dense')); return [w ? 'Compact table' : 'Compact table off', () => { if (!inTable()) return; if (cell().closest('table').classList.contains('dense') !== w) tableOp('dense'); }]; }
};
[['r+', 'Add row below'], ['ra', 'Add row above'], ['r-', 'Delete row'], ['c+', 'Add column right'], ['cl', 'Add column left'], ['c-', 'Delete column'], ['mr', 'Merge right'], ['md', 'Merge down'], ['split', 'Split cell']].forEach(([op, label]) => { REP[op] = () => [label, () => { if (inTable()) tableOp(op); }]; });
function repNote(a) { if (REP[a]) { const [label, run] = REP[a](); repSet(label, run); } }
function repeatLast() {
  if (!lastCmd || editing || board || DE.open) return;
  const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) live(); else if (!lastRange) return;
  if (selCode() && !/^(Divider|Insert code block|Note|Clear format)/.test(lastCmd.label)) return;   // as the toolbar: these do not apply in a code block
  if (mdCellSel() && /list/i.test(lastCmd.label)) return;   // as the toolbar: no lists in a table cell of a Markdown file
  clearTimeout(timer); histSnap(); lastCmd.run(); touch(); styleUI();
}
document.addEventListener('keydown', e => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyQ' && !DE.open && !$('#help').open && !NB.textOn()) { e.preventDefault(); repeatLast(); return; }   // not in the text editor, where Option+Q types a character
  { const k = e.key.toLowerCase(); if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && 'biu'.includes(k) && k && doc.contains(e.target) && !editing && (selCode() || (k === 'b' && selWeighted() && !cellSel))) { e.preventDefault(); e.stopPropagation(); if (!selCode()) { clearTimeout(timer); histSnap(); ACT.bold(); styleUI(); setTimeout(() => repNote('bold'), 0); } return; } }   // as the toolbar: no text formatting in a code block; Bold in heavier text goes through the toolbar's way
  // Bold and Italic by their own shortcuts count as the toolbar commands
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'B' || e.key === 'I') && doc.contains(e.target) && !editing) { const a = e.key.toLowerCase() === 'b' ? 'bold' : 'italic'; setTimeout(() => repNote(a), 0); }
}, true);
doc.addEventListener('mouseup', e => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.button === 0 && !paint && lastCmd && !(e.target.closest && e.target.closest('.fig,.dg,.note-log'))) setTimeout(repeatLast, 0); });

/* ---------- boxes ----------
   A box is for the reader: a note, information, tip, warning or critical message set apart from the text. It is a
   container (div.box.box-TYPE), inserted empty and then typed or pasted into; the blocks in it keep their own styles. Its first line is the label
   (p.box-h): it starts as the type's name and can be edited. The icon and colours come from the style sheet. */
const BOXES = { note: 'Note', info: 'Information', tip: 'Tip', warning: 'Warning', critical: 'Critical' };
function boxType(b) { return Object.keys(BOXES).find(k => b.classList.contains('box-' + k)) || 'note'; }
function boxLabel(b) { const h = b.firstElementChild; return h && h.classList.contains('box-h') ? h : null; }
function boxAt(n) { if (n && n.nodeType !== 1) n = n.parentElement; const b = n && n.closest('.box'); return b && doc.contains(b) && !b.closest('.fig,.dg') ? b : null; }
function plainLabel(h) { h.classList.remove('box-h'); if (!h.getAttribute('class')) h.removeAttribute('class'); }
/* Take the box away and leave what it held. The label goes too, unless it was given its own wording. */
function unbox(b) { const h = boxLabel(b); if (h) { const t = h.textContent.trim(); if (!t || t === BOXES[boxType(b)]) h.remove(); else plainLabel(h); } b.replaceWith(...b.childNodes); }
/* Text in a box sits in paragraphs, as it does in the page. Loose text in a box, and a plain div that holds only text
   (both come with pages made elsewhere), become paragraphs, so Enter and the styles work there as anywhere else. */
const BOX_BLOCK = /^(P|H[1-6]|UL|OL|DL|PRE|TABLE|DIV|DETAILS|HR|BLOCKQUOTE|SECTION|ARTICLE|ASIDE|FIGURE|HEADER|FOOTER|MAIN|NAV|FORM|FIELDSET)$/;
function boxParas(b) {
  const loose = n => n.nodeType === 3 || (n.nodeType === 1 && !BOX_BLOCK.test(n.nodeName));
  const text = n => n.nodeType === 3 ? !!n.data.replace(/[\s\u200b]+/g, '') : n.nodeName !== 'BR';
  const plain = d => d.nodeName === 'DIV' && !d.matches('.tw,.dg,.fig,.note,.note-body,.note-log,.note-entries,.box,.ed-handle,[class*="wb-"]') && !d.querySelector(BLOCKS + ',.dg,.fig,blockquote,section,article,aside,figure');
  const kids = [...b.childNodes];
  if (!kids.some(n => (loose(n) && text(n)) || (n.nodeType === 1 && plain(n)))) return;
  // the cursor is kept: a place given as "child k of the box" is held as the node beside it
  const s = getSelection(), ends = s.rangeCount && b.contains(s.anchorNode) && b.contains(s.focusNode) ? [[s.anchorNode, s.anchorOffset], [s.focusNode, s.focusOffset]].map(([n, o]) => n !== b ? { n, o } : o < kids.length ? { before: kids[o] } : kids.length ? { after: kids[kids.length - 1] } : { n, o }) : null;
  let run = [];
  const flush = () => { if (run.some(text)) { const q = document.createElement('p'); run[0].before(q); q.append(...run); } run = []; };
  kids.forEach(n => { if (loose(n)) run.push(n); else { flush(); if (plain(n)) { if (hasContent(n)) { const q = rename(n, 'p'); [...n.attributes].forEach(a => { if (a.name === 'class' || a.name === 'id') q.setAttribute(a.name, a.value); }); ends && ends.forEach(e => { if (e.n === n) e.n = q; if (e.before === n) e.before = q; if (e.after === n) e.after = q; }); } else n.remove(); } } });
  flush();
  if (ends) { try { const at = e => { const r = document.createRange(); if (e.n) r.setStart(e.n, e.o); else if (e.before) r.setStartBefore(e.before); else r.setStartAfter(e.after); return [r.startContainer, r.startOffset]; }; s.setBaseAndExtent(...at(ends[0]), ...at(ends[1])); lastRange = s.getRangeAt(0).cloneRange(); } catch (e) { } }
}
function boxFix(root) {
  $$('.box', root).forEach(b => {
    if (b.closest('.fig,.dg')) return;
    if (b.parentNode.closest && b.parentNode.closest('.box')) { unbox(b); return; } // no box inside a box
    boxParas(b);
    if (!b.hasAttribute('role')) b.setAttribute('role', 'note');
    if (![...b.children].some(c => !c.classList.contains('box-h') && (c.textContent.trim() || c.querySelector('img,svg,table,input') || c.matches('.dg,.fig,pre,p,ul,ol,dl,h2,h3,h4')))) { const s = getSelection(), here = s.rangeCount && b.contains(s.anchorNode), q = mk('p'); b.replaceWith(q); if (here) caret(q); }
  });
  $$('.box-h', root).forEach(h => { const p = h.parentNode; if (!(p.classList && p.classList.contains('box') && p.firstElementChild === h)) plainLabel(h); });
}
/* The whole blocks a selection reaches, side by side in the page (or in the container or margin note they share): what
   the Box list puts in a new box. A list or table is taken whole. A block the selection only touches the edge of is left out. */
const BOX_HOME = 'div:not(.tw,.box,.dg,.fig,.note,.note-log,.note-entries,.ed-handle),section,article,aside,header,footer,main,blockquote';
function boxBlocks(r) {
  let c = r.commonAncestorContainer; if (c.nodeType !== 1) c = c.parentElement;
  while (c && c !== doc && !(c.matches(BOX_HOME) && !c.closest('.fig,.dg,.note-log,table,li,dl,.box'))) c = c.parentElement;
  if (!c || !doc.contains(c)) return [];
  const kids = [...c.children].filter(k => r.intersectsNode(k) && !k.matches('.ed-handle,.note-log')), part = (k, head) => { const x = document.createRange(); x.selectNodeContents(k); if (head) x.setStart(r.startContainer, r.startOffset); else x.setEnd(r.endContainer, r.endOffset); return x.collapsed || !hasContent(x.cloneContents()); };
  if (kids.length > 1 && part(kids[kids.length - 1], false)) kids.pop();
  if (kids.length > 1 && part(kids[0], true)) kids.shift();
  return kids;
}
/* The Box list: with blocks selected it puts them in a new box; with no selection it inserts a new, empty box after the
   current block, ready to type or paste into. Inside a box it changes the box's type, or hides or shows its icon;
   Remove box takes the box away and keeps what it held. */
function setBox(v) {
  live(); restore(); const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
  const keep = [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset];
  const done = () => { if (doc.contains(keep[0]) && doc.contains(keep[2])) { try { s.setBaseAndExtent(...keep); lastRange = s.getRangeAt(0).cloneRange(); } catch (e) { } } touch(); styleUI(); };
  const cur = boxAt(s.anchorNode);
  if (v === 'none') { if (cur) { unbox(cur); done(); } return; }
  if (v === 'icon') { if (cur) { cur.classList.toggle('box-noicon'); done(); } return; }
  if (!BOXES[v]) return;
  if (cur) { // the label changes too, if it still says the old type
    const h = boxLabel(cur), was = BOXES[boxType(cur)]; Object.keys(BOXES).forEach(k => cur.classList.remove('box-' + k)); cur.classList.add('box-' + v);
    if (h && h.textContent.trim() === was && was !== BOXES[v]) { const inLabel = h.contains(keep[0]); h.textContent = BOXES[v]; if (inLabel) caret(h, true); }
    done(); return;
  }
  const picked = s.isCollapsed ? [] : boxBlocks(s.getRangeAt(0));
  if (picked.length) { const b2 = el('<div class="box box-' + v + '" role="note"><p class="box-h"></p></div>'); b2.firstChild.textContent = BOXES[v]; picked[0].before(b2); b2.append(...picked); done(); return; }
  const box = el('<div class="box box-' + v + '" role="note"><p class="box-h"></p><p><br></p></div>'); box.firstChild.textContent = BOXES[v];
  placeBlock(box);
  caret(box.lastChild); touch(); styleUI();
}
/* ---------- more formats ----------
   Superscript, subscript, strike-through and inline code share one toolbar list. Choosing one switches it on or off
   for the selected text; the list marks the ones that are on where the cursor is. */
const FMT = { sup: ['Superscript', 'sup', 'superscript'], sub: ['Subscript', 'sub', 'subscript'], strike: ['Strike-through', 's,strike,del', 'strikeThrough'], code: ['Inline code', 'code'], pill: ['Pill', 'span.pill:not(.r)'], pillr: ['Pill at right', 'span.pill.r'] };
// The formats made by hand, not by the browser's own commands: [tag, class, what counts as the same kind of format, how the message starts]. A pill is a short label in a rounded tag; a pill at right sits at the right-hand edge of its line.
const FMT_WRAP = { code: ['code', '', 'code', 'Inline code is'], pill: ['span', 'pill', 'span.pill', 'A pill is'], pillr: ['span', 'pill r', 'span.pill', 'A pill is'] };
function fmtOn(k) { const s = getSelection(); let n = s.rangeCount ? s.anchorNode : null; if (n && n.nodeType !== 1) n = n.parentElement; const e = n && n.closest(FMT[k][1]); return !!(e && doc.contains(e) && !e.closest('pre,.fig,.dg')); }
function setFmt(k, want) {
  restore(); const s = getSelection(); if (!s.rangeCount) return; let n = s.anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; if (!n || !doc.contains(n) || n.closest('pre,.fig,.dg')) return;
  const on = fmtOn(k); if (want === undefined) want = !on;
  if (!FMT_WRAP[k]) { if (on !== want || (!want && !s.isCollapsed && $$(FMT[k][1], doc).some(e => s.getRangeAt(0).intersectsNode(e)))) { document.execCommand(FMT[k][2]); if (!want && fmtOn(k)) document.execCommand(FMT[k][2]); } touch(); return; }
  const [wTag, wCls, wKind, wMsg] = FMT_WRAP[k], r = s.getRangeAt(0), inside = n.closest(wKind);
  if (!want) { const hit = inside ? [inside] : $$(wKind, doc).filter(c => !c.closest('pre,.fig,.dg') && r.intersectsNode(c)); if (!hit.length) return; const keep = [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset]; hit.forEach(c => c.replaceWith(...c.childNodes)); try { s.setBaseAndExtent(...keep); } catch (e) { } touch(); return; }
  if (inside) { if (wCls && inside.className !== wCls) { inside.className = wCls; touch(); } return; }   // in a pill of the other kind: it becomes this kind
  if (r.collapsed) return; const B = 'p,h1,h2,h3,h4,dt,dd,li,td,th', at = x => (x.nodeType === 1 ? x : x.parentElement).closest(B);
  if (at(r.startContainer) !== at(r.endContainer)) { alert(wMsg + ' for text inside one paragraph.' + (k === 'code' ? ' For several lines use a code block.' : '')); return; }
  const c = document.createElement(wTag); if (wCls) c.className = wCls; c.appendChild(r.extractContents()); $$(wKind, c).forEach(x => x.replaceWith(...x.childNodes)); r.insertNode(c); c.parentNode.normalize();
  const nr = document.createRange(); nr.selectNodeContents(c); s.removeAllRanges(); s.addRange(nr); lastRange = nr.cloneRange(); touch();
}
/* ---------- list indent and outdent ----------
   Indent moves the items the cursor or selection is in one level in, under the item above them (the first item of a
   list has nothing above it and stays). Outdent moves them one level out; the items below them at the old level go
   with the last one, as its inner list. At the top level an outdented item leaves the list and becomes a paragraph,
   or a plain line in a table cell. Tab and Shift+Tab do the same in a list outside a table. Q&A lists are not lists
   here and are untouched. */
function listItems() {
  const s = getSelection(); if (!s.rangeCount) return []; const r = s.getRangeAt(0), li0 = n => { if (n && n.nodeType !== 1) n = n.parentElement; const li = n && n.closest('li'); return li && doc.contains(li) && !li.closest('.fig,.dg') ? li : null; };
  const a = li0(r.startContainer); if (!a) return []; let b2 = li0(r.endContainer) || a; const L = a.parentNode;
  while (b2 && b2.parentNode !== L) b2 = li0(b2.parentNode); // the selection ends deeper or elsewhere: stay at the level it starts at
  const sibs = [...L.children].filter(x => x.tagName === 'LI'), i = sibs.indexOf(a), j = b2 ? sibs.indexOf(b2) : -1;
  if (j < i) return sibs.slice(i).filter(x => r.intersectsNode(x)); return sibs.slice(i, j + 1);
}
function olTidy() { $$('ul[start], ol[start="1"]', doc).forEach(l => l.removeAttribute('start')); }
function listLike(L) { const n = document.createElement(L.tagName.toLowerCase()); if (L.classList.contains('check')) n.className = 'check'; return n; }
function listShift(dir) {
  restore(); const lis = listItems(); if (!lis.length) return false; const s = getSelection(), keep = [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset], L = lis[0].parentNode;
  const back = fall => { try { if (!doc.contains(keep[0]) || !doc.contains(keep[2])) throw 0; s.setBaseAndExtent(...keep); lastRange = s.getRangeAt(0).cloneRange(); } catch (e) { if (fall && doc.contains(fall)) caret(fall, true); } };
  const inner = li => [...li.children].filter(x => /^(UL|OL)$/.test(x.tagName));
  if (dir > 0) {
    let prev = lis[0].previousElementSibling; while (prev && prev.tagName !== 'LI') prev = prev.previousElementSibling; if (!prev) return false;
    let into = inner(prev).pop(); if (!into) { into = listLike(L); prev.appendChild(into); }
    lis.forEach(li => into.appendChild(li)); back(lis[0]); touch(); styleUI(); return true;
  }
  const last = lis[lis.length - 1], rest = []; for (let x = last.nextElementSibling; x; x = x.nextElementSibling) if (x.tagName === 'LI') rest.push(x);
  const host = L.parentNode && L.parentNode.tagName === 'LI' ? L.parentNode : null;
  if (host) {
    if (rest.length) { let into = inner(last).pop(); if (!into) { into = listLike(L); last.appendChild(into); } rest.forEach(x => into.appendChild(x)); }
    let at = host; lis.forEach(li => { at.after(li); at = li; }); if (!L.children.length) L.remove();
    back(lis[0]); touch(); styleUI(); return true;
  }
  // top level: the items leave the list
  const tail = rest.length ? listLike(L) : null; if (tail) { if (L.classList.contains('dense')) tail.classList.add('dense'); rest.forEach(x => tail.appendChild(x)); }
  const cellish = !!L.parentNode.closest('td,th,li,dd'), made = []; let at = L;
  lis.forEach(li => {
    $$(':scope > input', li).forEach(x => x.remove());
    const p = document.createElement('p'), kids = inner(li); kids.forEach(k => k.remove()); p.append(...li.childNodes); if (!p.textContent.trim() && !p.querySelector('img,br')) p.appendChild(document.createElement('br'));
    at.after(p); at = p; made.push(p); kids.forEach(k => { if (L.classList.contains('dense')) k.classList.add('dense'); at.after(k); at = k; }); li.remove();
  });
  if (tail) at.after(tail); if (!L.children.length) L.remove();
  back(made[0]); if (cellish) made.forEach(p => { if (!p.parentNode) return; if (!p.textContent.trim() && !p.querySelector('img')) { const br = document.createElement('br'); p.replaceWith(br); if (!doc.contains(s.anchorNode) || s.anchorNode === br.parentNode) { s.collapse(br.parentNode, [...br.parentNode.childNodes].indexOf(br)); lastRange = s.getRangeAt(0).cloneRange(); } return; } toLine(p); });
  touch(); styleUI(); return true;
}
/* ---------- lists in a Q&A answer ----------
   The browser's own list command takes a Q&A list for a list to convert and breaks it, so inside a Q&A the list
   buttons are handled here. In an answer, the line or lines the cursor or selection is on become a list inside the
   answer; on an item of that list the same button takes the item back out and another list button changes the kind
   of list. In a question the list buttons do nothing. Returns true when the cursor is in a Q&A. */
function qaList(kind) {
  restore(); const item = qaItem(lastRange); if (!item) return false; if (item.tagName === 'DT') return true;
  const s = getSelection(), want = kind === 'ol' ? 'OL' : 'UL', chk = kind === 'check', keep = [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset];
  const back = fall => { try { if (!doc.contains(keep[0]) || !doc.contains(keep[2])) throw 0; s.setBaseAndExtent(...keep); lastRange = s.getRangeAt(0).cloneRange(); } catch (e) { if (fall && doc.contains(fall)) caret(fall, true); } };
  const isList = n => !!n && n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName), sameKind = n => isList(n) && n.tagName === want && n.classList.contains('check') === chk;
  const L = listAt();
  if (L && item.contains(L)) {
    if (sameKind(L)) { listShift(-1); return true; }
    let N = L; if (L.tagName !== want) { N = document.createElement(want.toLowerCase()); if (L.classList.contains('dense')) N.className = 'dense'; N.append(...L.childNodes); L.replaceWith(N); }
    N.classList.toggle('check', chk); if (!N.getAttribute('class')) N.removeAttribute('class');
    back(N.firstElementChild); touch(); styleUI(); return true;
  }
  const r = s.getRangeAt(0), top = n => { while (n && n.parentNode !== item) n = n.parentNode; return n; }, kids = [...item.childNodes];
  const a = r.startContainer === item ? kids[Math.min(r.startOffset, kids.length - 1)] : top(r.startContainer), z = r.collapsed ? a : (r.endContainer === item ? kids[Math.max(0, Math.min(r.endOffset, kids.length) - 1)] : top(r.endContainer));
  const lines = []; let cur = [];
  kids.forEach(n => { if (n.nodeName === 'BR') { lines.push({ nodes: cur, br: n }); cur = []; } else if (isList(n)) { if (cur.length) lines.push({ nodes: cur }); lines.push({ block: n }); cur = []; } else cur.push(n); });
  if (cur.length || !lines.length) lines.push({ nodes: cur });
  const at = n => lines.findIndex(l => l.block === n || l.br === n || (l.nodes && l.nodes.includes(n)));
  let i = a ? at(a) : lines.length - 1, j = z ? at(z) : i; if (i < 0) i = lines.length - 1; if (j < i) j = i; if (lines[i].block) return true;
  for (let k2 = i; k2 <= j; k2++) if (lines[k2].block) { j = k2 - 1; break; }
  const list = document.createElement(want.toLowerCase()); if (chk) list.className = 'check';
  const first = lines[i].nodes[0] || lines[i].br; if (first) first.before(list); else item.appendChild(list);
  for (let k2 = i; k2 <= j; k2++) { const li = document.createElement('li'), ln = lines[k2]; if (ln.nodes.some(n => n.nodeType !== 3 || n.data.trim())) li.append(...ln.nodes); else { ln.nodes.forEach(n => n.remove()); li.appendChild(document.createElement('br')); } if (ln.br) ln.br.remove(); list.appendChild(li); }
  let made = list; const pv = list.previousSibling, nx = list.nextSibling;
  if (sameKind(pv)) { pv.append(...list.childNodes); list.remove(); made = pv; }
  if (sameKind(nx)) { made.append(...nx.childNodes); nx.remove(); }
  back(made.lastElementChild); if (!s.rangeCount || !made.contains(s.anchorNode)) caret(made.lastElementChild, true);
  touch(); styleUI(); return true;
}
/* The list item the cursor is in, when that list is inside a Q&A answer. */
function qaListItem() { const q = qaItem(); if (!q) return null; const s = getSelection(); let n = s.anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; const li = n && n.closest('li'); return li && q.contains(li) ? li : null; }
/* ---------- checklists ----------
   A checklist is a bulleted list with the class "check". Each item starts with a real checkbox, so a saved document
   needs no script: the browser ticks the box and the style sheet places it. A tick made in the editor is written to
   the box's checked attribute, so it is saved with the document. checkFix keeps every item to exactly one leading box
   and removes boxes anywhere else. */
function checkFix(root) {
  // the browser makes a new list inside the paragraph it came from, which is not valid HTML and saves as stray empty paragraphs: lift the list out
  $$('p > ul, p > ol', root).forEach(l => {
    const p = l.parentNode; if (p.closest('.fig,.dg') || [...p.childNodes].some(n => n !== l && (n.nodeType === 1 ? n.nodeName !== 'BR' : n.data.trim()))) return;
    const s = getSelection(), k = s.rangeCount && l.contains(s.anchorNode) && l.contains(s.focusNode) ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
    p.replaceWith(l); if (k) { s.setBaseAndExtent(...k); lastRange = s.getRangeAt(0).cloneRange(); }
  });
  { const tags = $$('strike', root).filter(e => !e.closest('.fig,.dg')); if (tags.length) { const g = getSelection(), kp = g.rangeCount ? [g.anchorNode, g.anchorOffset, g.focusNode, g.focusOffset] : null; tags.forEach(e => rename(e, 's')); if (kp && doc.contains(kp[0]) && doc.contains(kp[2])) { try { g.setBaseAndExtent(...kp); lastRange = g.getRangeAt(0).cloneRange(); } catch (e) { } } } } // the browser writes strike-through as <strike>; the document keeps <s>
  boxFix(root);
  $$('ol.check', root).forEach(l => { l.classList.remove('check'); if (!l.getAttribute('class')) l.removeAttribute('class'); });
  const keep = new Set();
  $$('ul.check > li', root).forEach(li => {
    if (li.closest('.fig,.dg')) return;
    let box = [...li.children].find(c => c.matches('input[type=checkbox]'));
    if (!box) { box = document.createElement('input'); box.setAttribute('type', 'checkbox'); }
    if (li.firstChild !== box) li.prepend(box);
    [...box.attributes].forEach(a => { if (a.name !== 'type' && a.name !== 'checked') box.removeAttribute(a.name); });
    if (!box.nextSibling) li.appendChild(document.createElement('br'));
    keep.add(box);
  });
  $$('input', root).forEach(i => { if (!keep.has(i) && !i.closest('.fig,.dg')) i.remove(); });
  const s = getSelection(); if (s.rangeCount && s.isCollapsed && s.anchorNode.nodeType === 1 && s.anchorOffset === 0 && keep.has(s.anchorNode.firstChild)) s.collapse(s.anchorNode, 1);
}
/* ---------- ID tags, line breaks and joins in running text ----------
   The browser's own editing commands treat an ID tag as a style: a line break typed beside one lands inside it, Enter after
   one starts the next block inside a new one, and a tag at the start of a block is turned into plain text when that block
   is joined to the one before. These put the break or the new block outside the tag, and put a lost tag back. */
const TEXT_BLOCK = 'li,p,h1,h2,h3,h4,dt,dd,td,th';
function tagEdge() { // the tag the cursor is in or right beside, and whether the cursor is at its front
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed || !doc.contains(s.anchorNode)) return null;
  const n = s.anchorNode, o = s.anchorOffset, t = (n.nodeType === 1 ? n : n.parentElement).closest('span.id'), isTag = x => !!x && x.nodeType === 1 && x.matches('span.id');
  if (t) { const r = document.createRange(); r.selectNodeContents(t); r.setEnd(n, o); return { tag: t, before: !r.toString() && !!t.textContent }; }
  if (n.nodeType === 3) return o === 0 && isTag(n.previousSibling) ? { tag: n.previousSibling, before: false } : o === n.length && isTag(n.nextSibling) ? { tag: n.nextSibling, before: true } : null;
  return isTag(n.childNodes[o - 1]) ? { tag: n.childNodes[o - 1], before: false } : isTag(n.childNodes[o]) ? { tag: n.childNodes[o], before: true } : null;
}
function lineBreak() {
  if (!getSelection().isCollapsed) document.execCommand('delete');
  const e = tagEdge(); if (!e) { document.execCommand('insertLineBreak'); return; }
  clearTimeout(timer); histSnap();
  const br = document.createElement('br'); if (e.before) e.tag.before(br); else e.tag.after(br);
  let nx = br.nextSibling; while (nx && nx.nodeType === 3 && !nx.data) nx = nx.nextSibling;
  if (!nx || (nx.nodeType === 1 && nx.matches('ul,ol'))) br.after(document.createElement('br')); // a break at the end of a block needs a second one for the new line to show
  const r = document.createRange(); r.setStartAfter(br); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange();
}
/* A double-click selects one word. Where no space character lies between an ID tag and the word beside it (the gap seen
   is the tag's own margin) the browser takes the two as one word, so the selection is cut back to the side that was clicked. */
doc.addEventListener('dblclick', e => {
  const s = getSelection(); if (board || !s.rangeCount || s.isCollapsed || !e.target.closest || e.target.closest('.fig,.dg,.note-log')) return;
  const r = s.getRangeAt(0), hit = e.target.closest('span.id'), was = r.toString();
  if (hit) { const t = document.createRange(); t.selectNodeContents(hit); if (r.compareBoundaryPoints(Range.START_TO_START, t) < 0) r.setStart(t.startContainer, t.startOffset); if (r.compareBoundaryPoints(Range.END_TO_END, t) > 0) r.setEnd(t.endContainer, t.endOffset); }
  else { const at = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null; if (!at) return; $$('span.id', doc).filter(t => r.intersectsNode(t) && !t.closest('.fig,.dg')).forEach(t => { const tr = document.createRange(); tr.selectNode(t); const side = tr.comparePoint(at.startContainer, at.startOffset); if (side > 0) { if (r.comparePoint(tr.endContainer, tr.endOffset) === 0) r.setStartAfter(t); } else if (side < 0 && r.comparePoint(tr.startContainer, tr.startOffset) === 0) r.setEndBefore(t); }); }
  if (r.toString() !== was && !r.collapsed) { s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); styleUI(); }
});
/* Enter at the end of a block that ends with a tag: the next block starts plain. */
function enterAfterTag() {
  const e = tagEdge(); if (!e || e.before) return false;
  const blk = e.tag.closest('li,p,h1,h2,h3,h4'); if (!blk || !doc.contains(blk) || blk.closest('.fig,.dg,.note,dl.qa,td,th') || blk.matches('p.box-h')) return false;
  const s = getSelection(), r = document.createRange(); r.setStart(s.anchorNode, s.anchorOffset); r.setEnd(blk, blk.childNodes.length);
  const rest = r.cloneContents(); if (rest.textContent.trim() || rest.querySelector('ul,ol,img,table,input,.dg,.fig')) return false;
  clearTimeout(timer); histSnap();
  const n = blk.tagName === 'LI' ? mk('li') : mk('p'); blk.after(n); caret(n); touch(); styleUI(); return true;
}
/* Typing straight after an ID tag just made from a selection: the browser would put it in the tag. The first character
   goes after the tag instead, and the typing carries on there. */
let tagExit = null;
doc.addEventListener('beforeinput', e => {
  const sp = tagExit; tagExit = null; if (!sp || e.inputType !== 'insertText' || !e.data || !sp.isConnected) return;
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return; const r = s.getRangeAt(0);
  const inTag = sp.contains(r.startContainer), q = document.createRange();
  if (inTag) { const e2 = document.createRange(); e2.selectNodeContents(sp); e2.setStart(r.startContainer, r.startOffset); if (e2.toString()) return; }   // in the tag but not at its end
  else { try { q.setStartAfter(sp); q.setEnd(r.startContainer, r.startOffset); } catch (x) { return; } if (q.collapsed === false && (q.toString() || q.cloneContents().querySelector('*'))) return; }
  e.preventDefault(); let tn = !inTag && r.startContainer.nodeType === 3 ? r.startContainer : null, at = tn ? r.startOffset : 0;
  if (!tn) { tn = document.createTextNode(''); sp.after(tn); }
  tn.insertData(at, e.data);
  const c = document.createRange(); c.setStart(tn, at + e.data.length); c.collapse(true); s.removeAllRanges(); s.addRange(c); lastRange = c.cloneRange();
  doc.dispatchEvent(new InputEvent('input', { inputType: 'insertText', data: e.data }));
});
/* Joining blocks (Backspace at the start of one, Delete at the end of one, or deleting a selection across them). */
let joinWatch = null;
const tagTexts = () => $$('span.id', doc).map(t => t.textContent);
doc.addEventListener('beforeinput', e => {
  joinWatch = null; if (!/^delete/.test(e.inputType)) return;
  const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return; const r = s.getRangeAt(0), blockOfNode = x => (x.nodeType === 1 ? x : x.parentElement).closest(TEXT_BLOCK);
  const a = blockOfNode(r.startContainer), z = blockOfNode(r.endContainer); if (!a || !z || a.closest('.fig,.dg') || blockOf(r.startContainer)) return;
  if (r.collapsed) {
    const back = /Backward/.test(e.inputType), edge = document.createRange(); edge.selectNodeContents(a);
    if (back) edge.setEnd(r.startContainer, r.startOffset); else edge.setStart(r.startContainer, r.startOffset);
    const f = edge.cloneContents(); if (f.textContent || f.querySelector('br,img,ul,ol,table')) return; // only at the very edge of the block
    joinWatch = { before: tagTexts(), only: null };
  } else if (a !== z) { // a tag right after the end of the selection is the one at risk; tags inside the selection are meant to go
    const n = r.endContainer, o = r.endOffset; let nx = n.nodeType === 3 ? (o === n.length ? n.nextSibling : null) : n.childNodes[o];
    while (nx && nx.nodeType === 3 && !nx.data) nx = nx.nextSibling;
    joinWatch = { before: tagTexts(), only: nx && nx.nodeType === 1 && nx.matches('span.id') ? nx.textContent : '' };
  }
});
doc.addEventListener('input', () => {
  const w = joinWatch; joinWatch = null; if (!w) return;
  const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
  const blk = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest(TEXT_BLOCK); if (!blk) return;
  // what the join leaves behind: styles copied onto the text that moved
  $$('span,b,strong,i,em,u,s,code,a,sub,sup,font', blk).forEach(x => { if (x.closest('.fig,.dg,.note-log')) return; x.removeAttribute('style'); if ((x.tagName === 'SPAN' && !x.attributes.length) || x.tagName === 'FONT') x.replaceWith(...x.childNodes); });
  const now = tagTexts(); if (now.length >= w.before.length) return;
  const left = now.slice(), lost = w.before.filter(t => { const i = left.indexOf(t); if (i < 0) return true; left.splice(i, 1); return false; });
  for (const t of (w.only === null ? [...new Set(lost)] : lost.includes(w.only) ? [w.only] : [])) if (t && retag(blk, t)) break;
});
function retag(blk, text) { // the text right after the cursor is the lost tag's: make it a tag again
  const s = getSelection(), n = s.anchorNode, o = s.anchorOffset, r = document.createRange(); r.setStart(n, o); r.setEnd(blk, blk.childNodes.length);
  const w = document.createTreeWalker(blk, NodeFilter.SHOW_TEXT); let tn, acc = '', sN = null, sO = 0, eN = null, eO = 0;
  while ((tn = w.nextNode())) {
    let from = 0; if (!sN) { if (tn === n) from = o; else if (r.comparePoint(tn, 0) < 0) continue; }
    const piece = tn.data.slice(from, from + text.length - acc.length); if (!piece) { if (sN) break; continue; }
    if (!sN) { sN = tn; sO = from; } acc += piece; eN = tn; eO = from + piece.length; if (acc.length === text.length) break;
  }
  if (acc !== text || sN.parentElement.closest('span.id') || eN.parentElement.closest('span.id')) return false;
  const rr = document.createRange(); rr.setStart(sN, sO); rr.setEnd(eN, eO); rr.deleteContents();
  const sp = document.createElement('span'); sp.className = 'id'; sp.textContent = text; rr.insertNode(sp);
  const c = document.createRange(); c.setStartBefore(sp); c.collapse(true); s.removeAllRanges(); s.addRange(c); lastRange = c.cloneRange(); return true;
}
/* Enter at the end of a line that has a line break after it: the new block starts with the text, not a blank line. */
doc.addEventListener('input', e => {
  if (e.inputType !== 'insertParagraph') return; const s = getSelection(); if (!s.rangeCount || !s.isCollapsed) return;
  const b = (s.anchorNode.nodeType === 1 ? s.anchorNode : s.anchorNode.parentElement).closest('li,p'); if (!b || !doc.contains(b) || b.closest('.fig,.dg')) return;
  let f = b.firstChild; while (f && ((f.nodeType === 3 && !f.data) || f.nodeName === 'INPUT')) f = f.nextSibling;
  if (!f || f.nodeName !== 'BR') return; let nx = f.nextSibling; while (nx && nx.nodeType === 3 && !nx.data) nx = nx.nextSibling;
  if (!nx || (nx.nodeType === 1 && nx.matches('ul,ol,br'))) return;
  f.remove(); const r = document.createRange(); r.selectNodeContents(b); r.collapse(true); if (nx.nodeType === 3) r.setStart(nx, 0); else r.setStartBefore(nx); r.collapse(true); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange();
});
/* Line breaks inside a block are hidden from the browser's list command, which would make a list from one line only
   (inside the paragraph, or as loose text): with them hidden the whole block becomes one item, or one paragraph. */
const BRM = '\uE000';
function brHide() {
  const s = getSelection(); if (!s.rangeCount) return; const r = s.getRangeAt(0);
  $$('p,li,h1,h2,h3,h4', doc).filter(b => !b.closest('.fig,.dg,td,th,dl.qa') && r.intersectsNode(b)).forEach(b => $$('br', b).forEach(br => {
    if (br.parentNode.closest('p,li,h1,h2,h3,h4') !== b) return;
    let nx = br.nextSibling; while (nx && nx.nodeType === 3 && !nx.data) nx = nx.nextSibling;
    if (!nx || (nx.nodeType === 1 && nx.matches('ul,ol'))) return; // the break that holds an empty line open stays
    br.replaceWith(document.createTextNode(BRM));
  }));
}
function brShow() {
  const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT), hit = []; let n; while ((n = w.nextNode())) if (n.data.includes(BRM)) hit.push(n);
  const s = getSelection(); let an = s.rangeCount ? s.anchorNode : null, ao = s.rangeCount ? s.anchorOffset : 0, moved = false;
  hit.forEach(t => {
    const parts = t.data.split(BRM), f = document.createDocumentFragment(); let pos = 0;
    parts.forEach((p, i) => {
      if (i) { f.appendChild(document.createElement('br')); pos++; }
      const x = document.createTextNode(p); f.appendChild(x);
      if (an === t && !moved && ao <= pos + p.length) { an = x; ao = Math.max(0, ao - pos); moved = true; }
      pos += p.length;
    });
    t.replaceWith(f);
  });
  if (moved) { s.collapse(an, ao); lastRange = s.getRangeAt(0).cloneRange(); }
}
/* Make or remove a list. The browser moves a plain cursor to the start of the item; it goes back where it was. */
function listCmd(c) {
  restore(); const s = getSelection(), at = () => { let n = s.rangeCount ? s.anchorNode : null; if (n && n.nodeType !== 1) n = n.parentElement; return n && n.closest('li,p,h1,h2,h3,h4'); };
  // taking a list off is done here: the browser's own way leaves the text loose in the page, and in a box it takes the box with it
  { let on = false; try { on = document.queryCommandState(c); } catch (e) { } if (on && listAt()) { listShift(-1); return; } }
  { const r = s.rangeCount ? s.getRangeAt(0) : null;   // a heading cannot hold a list: it becomes a paragraph first, and that becomes the item
    if (r) $$('h1,h2,h3,h4', doc).filter(h => !h.closest('.fig,.dg') && (r.collapsed ? h.contains(r.startContainer) : r.intersectsNode(h))).forEach(h => { const c = caretGet(); const p = document.createElement('p'); p.append(...h.childNodes); h.replaceWith(p); caretPut(c); }); }
  brHide();
  let b = s.isCollapsed ? at() : null, text = '', k = 0;
  if (b && doc.contains(b)) { const r = document.createRange(); r.selectNodeContents(b); text = r.toString(); r.setEnd(s.anchorNode, s.anchorOffset); k = r.toString().length; } else b = null;
  document.execCommand(c); checkFix(doc);
  const a = b && s.isCollapsed ? at() : null;
  if (a && doc.contains(a) && a.textContent === text) { const w = document.createTreeWalker(a, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) { if (k <= n.length) { s.collapse(n, k); lastRange = s.getRangeAt(0).cloneRange(); break; } k -= n.length; } }
  brShow();
}
function listAt() { const s = getSelection(); let n = s.rangeCount ? s.anchorNode : null; if (n && n.nodeType !== 1) n = n.parentElement; const li = n && n.closest('li'); return li && doc.contains(li) && !li.closest('.fig,.dg') ? li.parentNode : null; }
/* Compact list: tighter lines for the whole list the cursor is in, its inner lists included. */
function listTop() { let l = listAt(); if (!l) return null; for (let p = l.parentNode.closest('ul,ol'); p && doc.contains(p); p = p.parentNode.closest('ul,ol')) l = p; return l; }
/* Start numbering at: a numbered list that carries on from an earlier one, after text, a table or a diagram between them.
   It is the list's own start attribute, so a saved document needs no script. The number is fixed: nothing ties it to the
   earlier list, and the author keeps it right. The form offers the number after the nearest numbered list above. */
function olAt() { const l = listAt(); return l && l.tagName === 'OL' ? l : null; }
const olFirst = l => { const v = parseInt(l.getAttribute('start'), 10); return isNaN(v) ? 1 : v; };
function olAbove(l) { // the nearest numbered list before this one at the same depth (an inner list looks at inner lists)
  const deep = !!l.parentNode.closest('li'), all = $$('ol', doc).filter(o => !o.closest('.fig,.dg') && !!o.parentNode.closest('li') === deep && !o.contains(l));
  let prev = null; all.forEach(o => { if (o.compareDocumentPosition(l) & Node.DOCUMENT_POSITION_FOLLOWING) prev = o; }); return prev;
}
const olEnd = l => olFirst(l) + $$(':scope > li', l).length - 1;
function olSet(l, n) { if (n === 1) l.removeAttribute('start'); else l.setAttribute('start', String(n)); }
let numJob = null;
function editStart() {
  live(); restore(); const l = olAt(); if (!l) return;
  const d = $('#numdlg'), N = $('#num-start'), up = olAbove(l);
  numJob = { l }; $('#num-err').textContent = '';
  N.value = l.hasAttribute('start') ? olFirst(l) : up ? olEnd(up) + 1 : 1;
  $('#num-hint').textContent = up ? 'The numbered list above ends at ' + olEnd(up) + '.' : 'There is no numbered list above this one.';
  d.showModal(); N.focus(); N.select();
}
function numDone(how) {
  const d = $('#numdlg'), job = numJob; if (!job) { d.close(); return; }
  const finish = () => { numJob = null; d.close(); restore(); };
  if (how === 'cancel') { finish(); return; }
  const t = $('#num-start').value.trim(), n = how === 'reset' ? 1 : /^\d{1,5}$/.test(t) ? parseInt(t, 10) : NaN;
  if (isNaN(n)) { $('#num-err').textContent = 'Enter a whole number from 0 to 99999.'; return; }
  finish(); if (!doc.contains(job.l)) return;
  if (olFirst(job.l) !== n || (n === 1 && job.l.hasAttribute('start'))) { olSet(job.l, n); touch(); }
  styleUI(); repSet('Start numbering at ' + n, () => { restore(); const l = olAt(); if (l && olFirst(l) !== n) { olSet(l, n); touch(); styleUI(); } });
}
$('#numdlg').addEventListener('click', e => { const b2 = e.target.closest('button[data-a]'); if (b2) numDone({ numsave: 'save', numreset: 'reset', numcancel: 'cancel' }[b2.dataset.a]); });
$('#numdlg').addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); numDone('save'); } });
$('#numdlg').addEventListener('cancel', e => { e.preventDefault(); numDone('cancel'); });
function listDense() { restore(); const l = listTop(); if (!l) return; l.classList.toggle('dense'); if (!l.getAttribute('class')) l.removeAttribute('class'); touch(); styleUI(); }
function inCheck() { const l = listAt(); return !!(l && l.matches('ul.check')); }
/* The cursor at the very start of a checklist item, just after its box. */
function checkStart() {
  const s = getSelection(); if (!s.rangeCount || !s.isCollapsed || !inCheck()) return null;
  let n = s.anchorNode; if (n.nodeType !== 1) n = n.parentElement; const li = n.closest('li'), box = li.firstChild; if (!box || box.nodeName !== 'INPUT') return null;
  const r = document.createRange(); r.setStartAfter(box); r.setEnd(s.anchorNode, s.anchorOffset);
  return r.toString() === '' && !r.cloneContents().querySelector('br,img,input') ? li : null;
}
function checkList() {
  if (qaList('check')) return;
  let l = listAt();
  if (l && l.matches('ul.check')) listCmd('insertUnorderedList');
  else { if (!l || l.tagName !== 'UL') { listCmd('insertUnorderedList'); l = listAt(); } if (l && l.tagName === 'UL') l.classList.add('check'); }
  touch(); styleUI();
}
doc.addEventListener('mousedown', e => { if (e.target.matches && e.target.matches('ul.check > li > input')) e.preventDefault(); });
doc.addEventListener('click', e => {
  const b = e.target; if (!(b.matches && b.matches('ul.check > li > input')) || b.closest('.fig,.dg')) return;
  e.preventDefault(); const on = !b.hasAttribute('checked'); clearTimeout(timer); histSnap();
  setTimeout(() => { b.toggleAttribute('checked', on); b.checked = on; touch(); }, 0); // after the click, or the browser puts the box back
});
/* ---------- clipboard ----------
   Copy and cut put the selection on the clipboard as the document's own clean HTML (marked data-fle-clip), so paste
   brings it back exactly: inline formatting, headings, lists, tables, code and diagrams. HTML from other programs is
   reduced to the structure this editor has (headings, paragraphs, lists, tables, bold, italics, links, code) and takes
   the document's style. Everything pasted goes through the same cleaning as Open. Code blocks take plain text. */
const CLIP_INLINE = /^(B|STRONG|I|EM|U|S|SUB|SUP|A|CODE|SPAN|MARK)$/, CLIP_WRAP = /^(UL|OL|DL|TABLE|THEAD|TBODY|TFOOT|TR)$/;
const BLOCKS = 'p,h1,h2,h3,h4,ul,ol,dl,pre,table,div,details,hr';
const hasContent = n => !!(n.textContent.replace(/[\s\u00a0\u200b]+/g, '') || n.nodeName === 'HR' || (n.querySelector && n.querySelector('img,svg,.dg,.fig,table,hr')));
function clipClean(box) {
  $$('.ed-handle', box).forEach(n => n.remove());
  $$('.note-log', box).forEach(n => n.remove());
  $$('.note-body', box).forEach(n => n.replaceWith(...n.childNodes));
  $$('.note', box).forEach(n => n.replaceWith(...n.childNodes));
  $$('[class]', box).forEach(n => { n.classList.remove('ed-sel', 'ed-selc', 'ed-active', 'ed-from', 'ed-connect', 'ed-dsel', 'ed-cell', 'note-date', 'note-who'); if (!n.getAttribute('class')) n.removeAttribute('class'); });
  $$('[contenteditable]', box).forEach(n => { n.removeAttribute('contenteditable'); }); $$('[data-ed-ct]', box).forEach(n => n.removeAttribute('data-ed-ct'));
  $$('.dg, .fig', box).forEach(n => n.removeAttribute('title'));
  $$('a[data-ed-title]', box).forEach(a => { a.removeAttribute('title'); a.removeAttribute('data-ed-title'); });
  $$('[id]', box).forEach(n => { if (!n.closest('.fig,.dg,svg')) n.removeAttribute('id'); });
  $$('img[data-md-src]', box).forEach(i => { i.setAttribute('src', i.getAttribute('data-md-src')); i.removeAttribute('data-md-src'); });   // a picture shown from a Markdown file's folder goes with its path
}
function clipFrom(r) {
  r = r.cloneRange(); // a selection that starts at the start of a checklist item takes the item's box with it, so its tick is kept
  { let n = r.startContainer; if (n.nodeType !== 1) n = n.parentElement; const li = n && n.closest('ul.check > li'), cb = li && li.firstChild; if (cb && cb.nodeName === 'INPUT' && !r.collapsed && !li.contains(r.endContainer)) { const t = document.createRange(); t.setStartAfter(cb); t.setEnd(r.startContainer, r.startOffset); if (t.toString() === '') r.setStartBefore(cb); } }
  const box = document.createElement('div'); box.appendChild(r.cloneContents());
  const last = box.lastChild; if (r.endOffset === 0 && last && last.nodeType === 1 && box.children.length > 1 && !hasContent(last)) last.remove();
  const first = box.firstChild; if (first && first.nodeType === 1 && box.children.length > 1 && !hasContent(first)) first.remove();
  let n = r.commonAncestorContainer; if (n.nodeType !== 1) n = n.parentNode;
  for (; n && n !== doc && (CLIP_INLINE.test(n.tagName) || CLIP_WRAP.test(n.tagName) || n.matches('div.tw')); n = n.parentNode) { const w = n.cloneNode(false); w.append(...box.childNodes); box.appendChild(w); }
  clipClean(box); return box;
}
function onCopy(e, cut) {
  if (editing || board || DE.open) return;
  if (dgSel && doc.contains(dgSel) && (dgCopyNow || !e.target.closest || !e.target.closest('#chrome, input, textarea, select'))) { dgCopyNow = false; e.preventDefault(); dgToClip(e.clipboardData); if (cut) dgCut(); return; }
  if (cellSel && cellSelCopy(e, cut)) return;
  const s = getSelection(); let box = null, text = '';
  if (s.rangeCount && !s.isCollapsed && doc.contains(s.anchorNode) && doc.contains(s.focusNode)) {
    if (blockOf(s.anchorNode) && blockOf(s.anchorNode) === blockOf(s.focusNode)) return; // inside one code block: plain text, as the browser does it
    box = clipFrom(s.getRangeAt(0)); text = s.toString();
  }
  if (!box) return;
  e.preventDefault(); box.setAttribute('data-fle-clip', '1');
  e.clipboardData.setData('text/html', box.outerHTML); e.clipboardData.setData('text/plain', text);
  if (cut) { clearTimeout(timer); histSnap(); document.execCommand('delete'); touch(); }
}
document.addEventListener('copy', e => onCopy(e, false));
document.addEventListener('cut', e => onCopy(e, true));
const SAFE_HREF = /^\s*(https?:|mailto:|tel:|#)/i;
const KEEP = { P: [], BR: [], HR: [], B: [], STRONG: [], I: [], EM: [], SUB: [], SUP: [], S: [], A: ['href'], CODE: [], PRE: [], H2: [], H3: [], H4: [], UL: [], OL: ['start'], LI: [], TABLE: [], THEAD: [], TBODY: [], TFOOT: [], TR: [], TH: ['colspan', 'rowspan'], TD: ['colspan', 'rowspan'], IMG: ['src', 'alt', 'width', 'height'] };
const BOXY = /^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|FIGURE|FIGCAPTION|BLOCKQUOTE|ADDRESS|CENTER|NAV|DT|DD|DETAILS|SUMMARY)$/;
function rename(e, tag) { const n = document.createElement(tag); n.append(...e.childNodes); e.replaceWith(n); return n; }
/* Bold from another program counts only where it is emphasis. A header cell, heading, Q&A question or box label has its
   own weight, and browsers copy that weight onto every element inside, so bold there says nothing and is dropped; bold
   inside bold is one bold. all: the content is going into such a place, so none of its bold is kept. */
const WEIGHTED = 'th,h1,h2,h3,h4,dt,p.box-h,tr.grp td';
function unbold(root, all) {
  const sel = all ? 'b,strong' : (WEIGHTED + ',b,strong').split(',').flatMap(w => [w + ' b', w + ' strong']).join();
  $$(sel, root).forEach(x => x.replaceWith(...x.childNodes)); root.normalize();
}
/* HTML from another program: keep the structure, drop its styling. */
function foreign(box) {
  $$('style,title,svg,math,head,xml,colgroup,col,caption,noscript,template,canvas,map,area', box).forEach(n => n.remove());
  $$('*', box).reverse().forEach(e => {
    if (!e.parentNode || e.closest('a.link-card')) return;
    const st = (e.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
    const bold = /font-weight:(bold|[6-9]00)/.test(st), plain = /font-weight:(normal|[1-4]00)/.test(st), ital = /font-style:italic/.test(st);
    let t = e.tagName;
    if (t === 'H1') { e = rename(e, 'h2'); t = 'H2'; } else if (t === 'H5' || t === 'H6') { e = rename(e, 'h4'); t = 'H4'; }
    if (t === 'STRIKE' || t === 'DEL') { e = rename(e, 's'); t = 'S'; }
    if (!KEEP[t] && !BOXY.test(t) && /text-decoration[^;]*:[^;]*line-through/.test(st) && hasContent(e)) { const w = document.createElement('s'); w.append(...e.childNodes); e.appendChild(w); }
    if ((t === 'B' || t === 'STRONG') && plain) { e.replaceWith(...e.childNodes); return; }
    if (t === 'A' && !SAFE_HREF.test(e.getAttribute('href') || '')) { e.replaceWith(...e.childNodes); return; }
    if (t === 'IMG' && !/^\s*data:image\//i.test(e.getAttribute('src') || '')) { e.remove(); return; }
    if (KEEP[t]) { [...e.attributes].forEach(a => { if (!KEEP[t].includes(a.name.toLowerCase())) e.removeAttribute(a.name); }); return; }
    if (BOXY.test(t)) { if (e.querySelector(BLOCKS)) e.replaceWith(...e.childNodes); else if (hasContent(e)) rename(e, 'p'); else e.remove(); return; }
    if (bold || ital) { let w = e; if (bold) w = rename(w, 'b'); if (ital) { if (bold) { const i = document.createElement('i'); i.append(...w.childNodes); w.appendChild(i); } else rename(w, 'i'); } return; }
    e.replaceWith(...e.childNodes);
  });
  $$('li,td,th', box).forEach(c => $$(':scope > p', c).forEach(p => { if (p.nextSibling && hasContent(p)) p.after(document.createElement('br')); p.replaceWith(...p.childNodes); }));
  // a heading inside a cell or list item becomes a bold line: the toolbar has no headings there, so it could not be made again
  $$('h2,h3,h4', box).filter(h => h.parentNode.closest('td,th,li')).forEach(h => { $$('b,strong', h).forEach(x => x.replaceWith(...x.childNodes)); if (!hasContent(h)) { h.remove(); return; } if (h.parentNode.closest('td,th,li').tagName !== 'TH') { const w = document.createElement('b'); w.append(...h.childNodes); h.appendChild(w); } toLine(h); });
  unbold(box);
  $$('pre', box).forEach(pre => { const lines = preText(pre).replace(/\n$/, '').split('\n'); pre.textContent = ''; lines.forEach((t, i) => { if (i) pre.appendChild(document.createElement('br')); if (t) pre.appendChild(document.createTextNode(t)); }); });
  $$('p,h2,h3,h4,li', box).forEach(n => { if (!hasContent(n) && !n.closest('table')) n.remove(); });
  $$('ul,ol', box).forEach(l => { if (!l.children.length) l.remove(); });
  $$('table', box).forEach(t => { if (!t.rows.length) { t.remove(); return; } if (!(t.parentNode.classList && t.parentNode.classList.contains('tw'))) { const w = document.createElement('div'); w.className = 'tw'; t.replaceWith(w); w.appendChild(t); } });
}
function clipRead(html) {
  const d = new DOMParser().parseFromString(html, 'text/html'), own = d.querySelector('[data-fle-clip]'), box = own || d.body;
  const w = d.createTreeWalker(box, NodeFilter.SHOW_COMMENT), cs = []; while (w.nextNode()) cs.push(w.currentNode); cs.forEach(c => c.remove());
  $$('script,nav,link,meta', box).forEach(n => n.remove());
  sanitize(box); unSave(box); remoteImgs += cardify(box);   // copied from a saved page: as when it is opened
  if (!own) foreign(box);
  // blocks present: loose text and inline runs between them become paragraphs
  if (box.querySelector(BLOCKS)) {
    let run = null;
    [...box.childNodes].forEach(n => {
      const block = n.nodeType === 1 && (n.matches(BLOCKS) || n.matches('.dg,.fig'));
      if (block) { run = null; return; }
      if (n.nodeType === 3 && !n.data.trim() && !run) { n.remove(); return; }
      if (n.nodeName === 'BR' && !run) { n.remove(); return; }
      if (!run) { run = document.createElement('p'); n.before(run); } run.appendChild(n);
    });
    $$(':scope > p', box).forEach(p => { if (!hasContent(p)) p.remove(); });
  }
  return document.importNode(box, true);
}
/* What a table cell, list item, Q&A item or note line can take: the lines of the pasted blocks, formatting kept. */
function clipLines(box) {
  // every block is a line, and so is any text that sits beside blocks rather than in one, so nothing copied is left out
  const BREAK = BLOCKS + ',li,dt,dd,td,th,tr,thead,tbody,tfoot,summary', out = []; let run = '';
  const flush = () => { const t = document.createElement('div'); t.innerHTML = run; if (hasContent(t)) out.push(run.replace(/^(\s*<br>)+/, '').replace(/(<br>\s*)+$/, '')); run = ''; };
  const walk = n => n.childNodes.forEach(c => {
    if (c.nodeType === 3) run += esc(c.data);
    else if (c.nodeType !== 1 || c.matches('.dg,.fig')) return;
    else if (/^H[1-4]$/.test(c.tagName)) { flush(); walk(c); if (run.trim()) run = '<b>' + run.replace(/<\/?(b|strong)>/g, '') + '</b>'; flush(); } // a heading becomes a bold line
    else if (c.matches(BREAK)) { flush(); walk(c); flush(); }
    else run += c.outerHTML;
  });
  walk(box); flush(); return out.join('<br>');
}
function clipAdopt(nodes) {
  nodes.forEach(n => {
    if (n.nodeType !== 1) return;
    [n, ...$$('*', n)].filter(x => x.matches('.dg,.fig')).forEach(f => { f.setAttribute('contenteditable', 'false'); f.setAttribute('title', 'Double-click to edit'); });
    $$('.wb-board', n).forEach(b => { const map = {}; $$(':scope > [id]', b).forEach(x => { map[x.id] = uid(); x.id = map[x.id]; }); $$('[data-from],[data-to],[data-conn]', b).forEach(x => ['from', 'to', 'conn'].forEach(k => { if (x.dataset[k] && map[x.dataset[k]]) x.dataset[k] = map[x.dataset[k]]; })); });
  });
}
/* Inline content goes in at the caret by hand: the browser's own insert adds inline styles when the block's style differs. */
function insertInline(html) {
  const s = getSelection(); if (!s.isCollapsed) document.execCommand('delete');
  const r = s.getRangeAt(0), t = document.createElement('template'); t.innerHTML = html; const f = t.content, last = f.lastChild; if (!last) return;
  let host = r.startContainer; if (host.nodeType !== 1) host = host.parentNode;
  if (host !== doc && host.childNodes.length === 1 && host.firstChild.nodeName === 'BR') { host.firstChild.remove(); r.setStart(host, 0); r.collapse(true); }
  r.insertNode(f);
  const c = document.createRange(); c.setStartAfter(last); c.collapse(true); s.removeAllRanges(); s.addRange(c); lastRange = c.cloneRange();
}
/* A block of cells pasted with the cursor in a table goes in cell for cell, from the cursor's cell across and down, as in a
   spreadsheet. Cells that hold something are replaced, and rows or columns the table has no room for are left out;
   in either case it says so and asks first. One copied cell is not a block: it goes in at the cursor like any text. */
let clipNoop = false;
function cellPaste(box) {
  const kids = [...box.children], w = kids.length === 1 && kids[0].matches('.tw,table') ? kids[0] : null, src = w && (w.matches('table') ? w : $(':scope > table', w)), home = cellEl();
  if (!src || !home || $('table', src)) return null;
  const S = tMatrix(src), rows = S.M.length, cols = Math.max(0, ...S.M.map(r => r.length)); if (new Set(S.M.flat().filter(Boolean)).size < 2) return null;
  const T = tMatrix(home.closest('table')), [r0, c0] = tPos(T, home), fitR = Math.min(rows, T.M.length - r0), fitC = Math.min(cols, T.M[r0].length - c0), jobs = [], from = new Set(), to = new Set();
  for (let i = 0; i < fitR; i++) for (let j = 0; j < fitC; j++) { const a = S.M[i][j], d = T.M[r0 + i][c0 + j]; if (!a || from.has(a)) continue; from.add(a); if (!d || to.has(d)) continue; to.add(d); jobs.push([d, a]); }
  const over = jobs.filter(([d]) => hasContent(d)).length, cutR = rows - fitR, cutC = cols - fitC, n = (k, w1) => k + ' ' + w1 + (k === 1 ? '' : 's');
  if (over || cutR || cutC) {
    const m = 'Pasting ' + n(rows, 'row') + ' by ' + n(cols, 'column') + ' of cells here:\n\n'
      + (over ? '- replaces what is in ' + n(over, 'cell') + '\n' : '')
      + (cutR ? '- leaves out the last ' + n(cutR, 'row') + ': the table has only ' + n(fitR, 'row') + ' from this cell down\n' : '')
      + (cutC ? '- leaves out the last ' + n(cutC, 'column') + ': the table has only ' + n(fitC, 'column') + ' from this cell across\n' : '')
      + '\nOK: paste.\nCancel: paste nothing.';
    if (!confirm(m)) { clipNoop = true; return false; }
  }
  if (!jobs.length) { clipNoop = true; return false; }
  jobs.forEach(([d, a]) => { d.innerHTML = hasContent(a) ? a.innerHTML : '<br>'; });
  clipAdopt(jobs.map(j => j[0])); cellSelClear(); caret(jobs[jobs.length - 1][0], true); return true;
}
function clipInsert(box) {
  const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
  let at = s.anchorNode; if (at.nodeType !== 1) at = at.parentElement;
  // from another program, into a place with its own weight (or into bold): its bold is not kept
  const heavy = !box.hasAttribute('data-fle-clip') && !!at.closest(WEIGHTED + ',b,strong');
  const put = h => { if (heavy) { const t = document.createElement('div'); t.innerHTML = h; unbold(t, true); h = t.innerHTML; } insertInline(h); };
  if (cellPaste(box) !== null) return;
  if (!box.querySelector(BLOCKS + ',.dg,.fig')) { put(box.innerHTML); return; }
  const li = at.closest('li'), lists = [...box.children].every(c => c.matches('ul,ol'));
  if (li && doc.contains(li) && !cellEl() && lists && !s.isCollapsed) document.execCommand('delete');
  if (li && doc.contains(li) && li.isConnected && !cellEl() && lists) {
    const items = $$(':scope > ul > li, :scope > ol > li', box); if (!items.length) return;
    if (hasContent(li)) li.after(...items); else li.replaceWith(...items);
    clipAdopt(items); caret(items[items.length - 1], true); return;
  }
  if (cellEl() || at.closest('li,dt,dd,.note-log')) { const h = clipLines(box); if (h) put(h); return; }
  if (!s.isCollapsed) document.execCommand('delete');
  const r = getSelection().getRangeAt(0); let cur = r.startContainer; if (cur === doc) cur = doc.childNodes[r.startOffset] || doc.lastChild;
  while (cur && cur.parentNode !== doc && !holds(cur.parentNode)) cur = cur.parentNode;
  const nodes = [...box.childNodes]; clipAdopt(nodes);
  if (!cur || cur.nodeType !== 1) doc.append(...nodes);
  else if (cur.matches('p,h1,h2,h3,h4') && cur.contains(r.startContainer)) {
    const tail = document.createRange(); tail.setStart(r.startContainer, r.startOffset); tail.setEnd(cur, cur.childNodes.length);
    const rest = tail.extractContents(), head = hasContent(cur), more = hasContent(rest);
    if (!head && !more) cur.replaceWith(...nodes);
    else if (!head) { cur.textContent = ''; cur.append(rest); cur.before(...nodes); }
    else { cur.after(...nodes); if (more) { const c2 = cur.cloneNode(false); c2.removeAttribute('id'); c2.append(rest); nodes[nodes.length - 1].after(c2); } }
  } else cur.after(...nodes);
  const end = nodes[nodes.length - 1];
  if (end.matches('p,h1,h2,h3,h4,pre')) caret(end, true); else { if (!end.nextElementSibling) end.after(mk('p')); caret(end.nextElementSibling, false); }
}
doc.addEventListener('paste', e => {
  if (DE.open) { e.preventDefault(); return; }   // the diagram editor is open over the page: nothing goes into the document behind it
  if (editing) return; e.preventDefault(); const t = e.clipboardData.getData('text/plain'), h = e.clipboardData.getData('text/html');
  clearTimeout(timer); histSnap(); clipNoop = false;
  if (blockOf(getSelection().anchorNode)) codeInsert(t);
  else if (h && h.trim()) { const box = clipRead(h); if (hasContent(box)) clipInsert(box); else if (t) document.execCommand('insertText', false, t); fit(); styleUI(); }
  else if (inCell()) document.execCommand('insertHTML', false, t.split(/\r?\n/).map(esc).join('<br>'));
  else document.execCommand('insertText', false, t);
  if (!clipNoop) touch();
});

function addTable() {
  const v = (prompt('Columns, rows', '3,3') || '').split(',').map(Number); if (!v[0] || !v[1]) return;
  const t = el('<div class="tw"><table><thead><tr>' + '<th>Heading</th>'.repeat(v[0]) + '</tr></thead><tbody>' + ('<tr>' + '<td><br></td>'.repeat(v[0]) + '</tr>').repeat(v[1]) + '</tbody></table></div>');
  insertBlock(t); t.after(el('<p><br></p>'));
}
function cell() { let n = lastRange && lastRange.startContainer; if (!n) return null; if (n.nodeType !== 1) n = n.parentElement; const c = n.closest('td,th'); return c && doc.contains(c) && !c.closest('.fig') ? c : null; }
/* Table engine: every operation edits a matrix of cell references, then the rows are rebuilt from it,
   so merged cells (colspan and rowspan) stay consistent through every change. */
function tMatrix(t) {
  const rows = [...t.rows], M = rows.map(() => []);
  rows.forEach((tr, r) => { let c = 0; [...tr.cells].forEach(x => { while (M[r][c]) c++; for (let i = 0; i < x.rowSpan && r + i < rows.length; i++) for (let j = 0; j < x.colSpan; j++) M[r + i][c + j] = x; c += x.colSpan; }); });
  const W = Math.max(0, ...M.map(m => m.length)); M.forEach(m => { m.length = W; });
  return { t, M, rows: rows.map(tr => ({ tr, sec: tr.parentNode })) };
}
function tPos(T, x) { for (let r = 0; r < T.M.length; r++) { const c = T.M[r].indexOf(x); if (c >= 0) return [r, c]; } return null; }
function tExtent(T, x) { const [r, c] = tPos(T, x); let r2 = r, c2 = c; while (T.M[r][c2 + 1] === x) c2++; while (T.M[r2 + 1] && T.M[r2 + 1][c] === x) r2++; return [r, c, r2, c2]; }
function tRebuild(T) {
  const seen = new Set();
  T.rows.forEach(({ tr }) => { while (tr.firstChild) tr.firstChild.remove(); });
  T.M.forEach((m, r) => m.forEach((x, c) => {
    if (!x || seen.has(x)) return; seen.add(x);
    let cs = 1, rs = 1; while (m[c + cs] === x) cs++; while (T.M[r + rs] && T.M[r + rs][c] === x) rs++;
    if (cs > 1) x.colSpan = cs; else x.removeAttribute('colspan'); if (rs > 1) x.rowSpan = rs; else x.removeAttribute('rowspan');
    T.rows[r].tr.appendChild(x);
  }));
  T.rows.forEach(({ tr }) => { if (!tr.cells.length) tr.remove(); });
  $$('colgroup', T.t).forEach(n => n.remove());
}
function newCellLike(x, inHead) { const n = document.createElement(inHead ? 'th' : (x ? x.tagName.toLowerCase() : 'td')); if (x && x.className) n.className = x.className; if (!inHead && x && x.getAttribute('scope')) n.setAttribute('scope', x.getAttribute('scope')); n.innerHTML = inHead ? 'Heading' : '<br>'; return n; }
/* ---------- style inspector ----------
   On demand only: the Inspect button reads the formatting at the cursor, or at the start of the selection, once, and
   shows it in a small popup, outermost first. Nothing is watched or re-read while the popup is open. Anything the
   toolbar cannot make where it is, is marked, and a text format can be taken off from the popup. */
const INSPECT_INLINE = { B: 'Bold', STRONG: 'Bold', I: 'Italic', EM: 'Italic', CODE: 'Inline code', SUP: 'Superscript', SUB: 'Subscript', S: 'Strike-through', STRIKE: 'Strike-through', DEL: 'Strike-through', U: 'Underline', INS: 'Underline', MARK: 'Highlight', SMALL: 'Small text', BIG: 'Large text', KBD: 'Keyboard text', SAMP: 'Sample text', TT: 'Typewriter text', VAR: 'Variable text', FONT: 'Pasted font setting' };
const INSPECT_PARA = { sub: 'H1 subtitle', h2sub: 'H2 subtitle', bluf: 'Lead paragraph', cap: 'Caption', 'box-h': 'Box label' };
function inspectOne(e) {
  const t = e.tagName, c = e.classList, host = e.parentNode.closest('td,th,li'), where = host ? (host.tagName === 'LI' ? 'a list item' : 'a table cell') : '';
  if (c.contains('box')) return { name: BOXES[boxType(e)] + ' box' };
  if (c.contains('note') && !c.contains('note-body')) return { name: 'Margin note' };
  if (t === 'TABLE') return { name: (c.contains('lop') || c.contains('spine') ? 'Fancy table' : 'Table') + (c.contains('dense') ? ', compact' : '') + (c.contains('cw') ? ', set column widths' : '') + Object.keys(TF).map(k => { const v = tfGet(e, k); return v ? ', ' + TF_NAME[k].toLowerCase() + ' ' + TF[k][v].toLowerCase() : ''; }).join('') };
  if (t === 'TD') return { name: 'Table cell' };
  if (t === 'TH') return { name: (c.contains('sub') ? 'Sub header cell' : 'Header cell') + (e.getAttribute('scope') === 'row' ? ' (header column)' : e.getAttribute('scope') === 'col' ? ' (header row)' : '') };
  if (t === 'LI') { const l = e.parentNode, top = e.closest('ul.dense, ol.dense'); return { name: (l.classList.contains('check') ? 'Checklist item' : l.tagName === 'OL' ? 'Numbered list item' + (l.hasAttribute('start') ? ', list starts at ' + olFirst(l) : '') : 'Bulleted list item') + (l.parentNode.closest('li') ? ', in an inner list' : '') + (top ? ', compact' : '') }; }
  if (t === 'DT') return { name: 'Q&A question' }; if (t === 'DD') return { name: 'Q&A answer' };
  if (t === 'PRE') return { name: 'Code block', odd: where ? 'The toolbar cannot make this in ' + where : '' };
  if (/^H[1-6]$/.test(t)) return { name: t === 'H1' ? 'Title (H1)' : 'Heading ' + t[1] + ' (H' + t[1] + ')', odd: where ? 'The toolbar cannot make a heading in ' + where : (+t[1] > 4 ? 'Not a toolbar style' : ''), line: !!where };
  if (t === 'P') { const k = Object.keys(INSPECT_PARA).find(x => c.contains(x)); return { name: k ? INSPECT_PARA[k] : 'Paragraph', odd: where ? 'The toolbar cannot make a paragraph in ' + where : '', line: !!where }; }
  if (t === 'A') return { name: 'Link: ' + (e.getAttribute('href') || ''), inline: true, off: 'Remove link' };
  if (t === 'SPAN' && c.contains('id')) return { name: 'ID tag', inline: true, off: 'Remove tag' };
  if (t === 'SPAN' && c.contains('pill')) return { name: c.contains('r') ? 'Pill at right' : 'Pill', inline: true, off: 'Remove' };
  if (INSPECT_INLINE[t]) return { name: INSPECT_INLINE[t], inline: true, off: 'Remove', odd: /^(B|STRONG|I|EM|SUP|SUB|S|STRIKE|DEL|CODE)$/.test(t) ? '' : 'No toolbar button for this' };
  if (t === 'SPAN') return e.getAttribute('style') ? null : { name: 'Plain wrapper (no effect)', inline: true, off: 'Remove' };
  if (/^(DIV|THEAD|TBODY|TFOOT|TR|UL|OL|DL|DETAILS|SUMMARY)$/.test(t)) return null; // structure the rows above and below already describe
  return { name: 'Other element <' + t.toLowerCase() + '>', odd: 'Not a toolbar style', inline: getComputedStyle(e).display.startsWith('inline'), off: 'Remove' };
}
function inspectTarget() {
  const r = lastRange; if (!r || !doc.contains(r.startContainer)) return null; let n = r.startContainer, o = r.startOffset;
  if (n.nodeType === 1) { n = n.childNodes[Math.min(o, n.childNodes.length - 1)] || n; while (n.nodeType === 1 && n.firstChild && n.nodeName !== 'BR') n = n.firstChild; }
  else if (!r.collapsed && o === n.length) { const w = document.createTreeWalker(doc, NodeFilter.SHOW_TEXT); w.currentNode = n; let x; while ((x = w.nextNode())) { if (!r.intersectsNode(x)) break; if (x.data.trim()) { n = x; break; } } } // a selection that begins at the very end of one piece of text is about the next piece
  const e = n.nodeType === 1 ? n : n.parentElement; return e && doc.contains(e) && !e.closest('.fig,.dg,.note-log') ? e : null;
}
function inspectClose() { const d = $('#insp'); if (d.open) d.close(); }
function inspect() {
  const d = $('#insp'); if (d.open) { d.close(); return; }
  live(); const e = inspectTarget(); if (!e) { alert('Place the cursor in the text, or select a word, first.'); return; }
  const chain = []; for (let x = e; x && x !== doc; x = x.parentElement) chain.unshift(x);
  const rows = []; chain.forEach(x => { const st = x.getAttribute('style'); const one = inspectOne(x); if (one) rows.push(Object.assign(one, { e: x })); if (st && x.matches('td,th') && cellBg(x) && /^background-color:#[0-9A-Fa-f]{6}(;color:#FFFFFF)?$/.test(st)) rows.push({ name: 'Cell colour ' + cellBg(x), inline: true, off: 'Remove colour', e: x, style: true }); else if (st && !x.closest('.fig,.dg') && !x.matches('col')) rows.push({ name: 'Pasted styling: ' + st.trim().slice(0, 90), odd: 'Not a toolbar style', inline: true, off: 'Remove', e: x, style: true }); });
  const cs = getComputedStyle(e), hex = v => { const m = v.match(/[\d.]+/g); return m ? '#' + m.slice(0, 3).map(n => Math.round(+n).toString(16).padStart(2, '0')).join('').toUpperCase() : v; };
  const sel = lastRange.collapsed ? '' : lastRange.toString().trim().slice(0, 60), list = $('#insp-list'); list.textContent = '';
  $('#insp-what').textContent = sel ? 'At the start of “' + sel + '”' : 'At the cursor';
  rows.forEach((x, i) => {
    const li = document.createElement('li'); if (x.odd) li.className = 'odd'; const nm = document.createElement('span'); nm.textContent = x.name; li.appendChild(nm);
    if (x.odd) { const o = document.createElement('small'); o.textContent = x.odd; li.appendChild(o); }
    const act = x.line ? 'Make a plain line' : (x.inline && x.off ? x.off : ''); if (act) { const b2 = document.createElement('button'); b2.type = 'button'; b2.textContent = act; b2.dataset.i = i; li.appendChild(b2); }
    list.appendChild(li);
  });
  { const look = $('#insp-look'), ul = document.createElement('ul'), head = document.createElement('b'); look.textContent = ''; head.textContent = 'Style attributes:'; look.append(head, ul); [['Font', cs.fontFamily.split(',')[0].replace(/["']/g, '')], ['Size', Math.round(parseFloat(cs.fontSize) * 10) / 10 + 'px'], ['Weight', cs.fontWeight], ['Style', cs.fontStyle === 'italic' ? 'italic' : ''], ['Colour', hex(cs.color)]].forEach(([k2, v]) => { if (!v) return; const li = document.createElement('li'); li.textContent = k2 + ': ' + v; ul.appendChild(li); }); }
  list.onclick = ev => {
    const b2 = ev.target.closest('button[data-i]'); if (!b2) return; const x = rows[+b2.dataset.i]; if (!x || !doc.contains(x.e)) return;
    clearTimeout(timer); histSnap(); const keep = x.e.parentNode;
    if (x.style) { x.e.removeAttribute('style'); if (x.e.matches('span,font') && !x.e.attributes.length) x.e.replaceWith(...x.e.childNodes); }
    else if (x.line) toLine(x.e); else x.e.replaceWith(...x.e.childNodes);
    keep.normalize(); touch(); d.close(); if (lastRange && doc.contains(lastRange.startContainer)) inspect(); // read it again, once, to show the result
  };
  d.show();
}
document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('#insp').open) inspectClose(); });
doc.addEventListener('mousedown', inspectClose); doc.addEventListener('keydown', e => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) inspectClose(); });
$('#insp').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
$('#insp').addEventListener('click', e => { if (e.target.closest('[data-a="inspclose"]')) inspectClose(); });
/* ---------- selecting cells ----------
   A browser selects text in one run, row by row, so a column cannot be selected as text. Shift+click on another cell
   of the same table, or dragging from one cell into another, selects the block of cells between them instead:
   a column, a row or a rectangle. Bold, Italic, Clear format, the header and merge buttons, Delete, copy and cut then
   act on those cells. Escape, a click or typing ends it. The cells are marked with the editing-only class ed-cell. */
let cellSel = null, cellDrag = null; // cellSel: { t, a: [row, column], b: [row, column] }
function cellAt(n) { if (n && n.nodeType !== 1) n = n.parentElement; const c = n && n.closest && n.closest('td,th'); return c && doc.contains(c) && !c.closest('.fig,.dg') ? c : null; }
function cellSelInfo() {
  if (!cellSel || !doc.contains(cellSel.t)) return null;
  const T = tMatrix(cellSel.t), at = p => T.M[p[0]] && T.M[p[0]][p[1]], a = at(cellSel.a), b = at(cellSel.b); if (!a || !b) return null;
  const p = tExtent(T, a), q = tExtent(T, b), R = tGrow(T, [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])]), cells = [];
  for (let r = R[0]; r <= R[2]; r++) for (let c = R[1]; c <= R[3]; c++) { const x = T.M[r][c]; if (x && !cells.includes(x)) cells.push(x); }
  return { T, R, cells, a };
}
function cellSelPaint() {
  $$('.ed-cell', doc).forEach(x => { x.classList.remove('ed-cell'); if (!x.getAttribute('class')) x.removeAttribute('class'); });
  const info = cellSelInfo(); if (!info) { cellSel = null; doc.classList.remove('ed-cells'); tfUI(); return; }
  info.cells.forEach(x => x.classList.add('ed-cell')); doc.classList.add('ed-cells'); tfUI();
}
function cellSelSet(a, b) { const t = a.closest('table'), T = tMatrix(t), p = tPos(T, a), q = tPos(T, b); if (!p || !q) return; cellSel = { t, a: p, b: q }; cellSelPaint(); }
function cellSelClear() { if (!cellSel && !doc.classList.contains('ed-cells')) return; cellSel = null; cellSelPaint(); }
/* Bold, Italic and Clear format on every selected cell. Bold and Italic turn on unless every cell with text already has them. */
function cellFormat(a) {
  const info = cellSelInfo(); if (!info) return; const s = getSelection(), filled = info.cells.filter(x => x.textContent.trim());
  const pick = x => { const r = document.createRange(); r.selectNodeContents(x); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); };
  clearTimeout(timer); histSnap();
  if (a === 'clear') filled.forEach(x => { pick(x); clearFormat(); });
  else { const c = a, state = x => { pick(x); try { return document.queryCommandState(c); } catch (e) { return false; } }, want = !filled.every(state); filled.forEach(x => { if (state(x) !== want) document.execCommand(c); }); }
  const home = cellSelInfo(); if (home) caret(home.a, false);
  cellSelPaint(); touch();
}
function cellSelCopy(e, cut) {
  const info = cellSelInfo(); if (!info) return false; const { T, R } = info, seen = new Set(), rows = [], lines = [];
  for (let r = R[0]; r <= R[2]; r++) { const tr = document.createElement('tr'), txt = []; for (let c = R[1]; c <= R[3]; c++) { const x = T.M[r][c]; if (!x || seen.has(x)) continue; seen.add(x); tr.appendChild(x.cloneNode(true)); txt.push(x.innerText.replace(/\s*\n\s*/g, ' ').trim()); } if (tr.cells.length) { rows.push(tr); lines.push(txt.join('\t')); } }
  const box = el('<div><div class="tw"><table><tbody></tbody></table></div></div>'); $('tbody', box).append(...rows); clipClean(box); box.setAttribute('data-fle-clip', '1');
  e.preventDefault(); e.clipboardData.setData('text/html', box.outerHTML); e.clipboardData.setData('text/plain', lines.join('\n'));
  if (cut) { clearTimeout(timer); histSnap(); info.cells.forEach(x => { x.innerHTML = '<br>'; }); touch(); }
  return true;
}
doc.addEventListener('mousedown', e => {
  cellDrag = null; if (e.button !== 0 || e.altKey || editing || board || paint) return;
  const c = cellAt(e.target), info = cellSel && cellSelInfo();
  if (e.shiftKey && c) { // from the cell the cursor is in, or the cell the block started from
    const from = info && cellSel.t === c.closest('table') ? info.a : cellAt(getSelection().anchorNode);
    if (from && from !== c && from.closest('table') === c.closest('table')) { e.preventDefault(); cellSelSet(from, c); return; }
  }
  cellSelClear(); if (c && !e.shiftKey) cellDrag = c;
});
document.addEventListener('mousemove', e => {
  if (!cellDrag) return; if (!(e.buttons & 1) || !doc.contains(cellDrag)) { cellDrag = null; return; }
  const c = cellAt(e.target); if (!c || c.closest('table') !== cellDrag.closest('table')) return;
  if (c !== cellDrag || cellSel) cellSelSet(cellDrag, c);
});
document.addEventListener('mouseup', () => {
  if (!cellDrag) return; const from = cellDrag; cellDrag = null; if (!cellSel) return;
  const info = cellSelInfo(); if (!info || info.cells.length < 2) { cellSelClear(); return; } // back in one cell: an ordinary text selection
  if (doc.contains(from)) caret(from, false); // the text selection made on the way is dropped; the cursor waits in the first cell
}, true);
doc.addEventListener('keydown', e => {
  if (!cellSel || editing || board) return; const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); cellSelClear(); return; }
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); e.stopPropagation(); const info = cellSelInfo(); if (info) { clearTimeout(timer); histSnap(); info.cells.forEach(x => { x.innerHTML = '<br>'; }); caret(info.a, false); touch(); } return; }
  if (ctrl && !e.altKey && !e.shiftKey && (k.toLowerCase() === 'b' || k.toLowerCase() === 'i')) { e.preventDefault(); e.stopPropagation(); cellFormat(k.toLowerCase() === 'b' ? 'bold' : 'italic'); return; }
  if (ctrl || k === 'Shift' || k === 'Control' || k === 'Alt' || k === 'Meta') return; // copy, cut and other shortcuts act on the block
  cellSelClear();
}, true);
/* ---------- column widths ----------
   Dragging the border between two columns moves width from one to the other. The table keeps its own width, the
   full text width, so it always fits the page. Widths are saved as percentages in a colgroup, and a table that has
   them is laid out to them exactly (class cw). A double-click on a border goes back to automatic widths. */
function tWidths(t) { const cs = $$(':scope > colgroup > col', t); return t.classList.contains('cw') && cs.length ? cs.map(c => parseFloat(c.style.width) || 0) : null; }
function tSetWidths(t, w) {
  $$(':scope > colgroup', t).forEach(n => n.remove());
  if (!w || !w.length) { t.classList.remove('cw'); if (!t.getAttribute('class')) t.removeAttribute('class'); return; }
  const sum = w.reduce((a, b) => a + b, 0) || 1, g = document.createElement('colgroup');
  w.forEach(x => { const c = document.createElement('col'); c.style.width = (Math.round(x / sum * 10000) / 100) + '%'; g.appendChild(c); });
  t.prepend(g); t.classList.add('cw');
}
/* The widths the columns have on screen now, as shares of the table. */
function tMeasure(t) {
  const T = tMatrix(t), W = T.M[0] ? T.M[0].length : 0, out = new Array(W).fill(0), tw = t.getBoundingClientRect().width || 1;
  for (let k = 0; k < W; k++) { const m = T.M.find(row => row[k] && row[k].colSpan === 1); if (m) out[k] = m[k].getBoundingClientRect().width / tw * 100; }
  const missing = out.filter(v => !v).length; if (missing) { const share = Math.max(2, (100 - out.reduce((a, b) => a + b, 0)) / missing); for (let k = 0; k < W; k++) if (!out[k]) out[k] = share; }
  return out;
}
/* The column border under the pointer, if there is one: the table and the number of the column to its right. The
   table's own left and right edges are not borders between columns, so they do not count. */
function colBorderAt(e) {
  const c = e.target && e.target.closest && e.target.closest('td,th'); if (!c || !doc.contains(c) || c.closest('.fig,.dg')) return null;
  const t = c.closest('table'), r = c.getBoundingClientRect(), T = tMatrix(t), x = tExtent(T, c), W = T.M[0].length;
  if (e.clientX >= r.right - 4 && x[3] + 1 < W) return [t, x[3] + 1];
  if (e.clientX <= r.left + 4 && x[1] > 0) return [t, x[1]];
  return null;
}
let colDrag = null, colTap = null;
doc.addEventListener('pointermove', e => { if (colDrag) return; doc.classList.toggle('ed-colrz', !editing && !board && !paint && !e.buttons && !!colBorderAt(e)); });
doc.addEventListener('pointerleave', () => { if (!colDrag) doc.classList.remove('ed-colrz'); });
doc.addEventListener('pointerdown', e => {
  if (e.button !== 0 || e.altKey || editing || board || paint) return; const hit = colBorderAt(e); if (!hit) return;
  e.preventDefault(); e.stopImmediatePropagation(); clearTimeout(timer); histSnap();
  const [t, b] = hit, had = tWidths(t), cols = tMatrix(t).M[0].length, w0 = had && had.length === cols ? had : tMeasure(t);
  // a second press on the same border straight after the first is a double-click: back to automatic widths
  if (colTap && colTap.t === t && colTap.b === b && e.timeStamp - colTap.at < 450) { colTap = null; if (had) { tSetWidths(t, null); touch(); } return; }
  colTap = { t, b, at: e.timeStamp };
  const tw = t.getBoundingClientRect().width || 1, x0 = e.clientX, min = Math.max(3, 28 / tw * 100), lo = min - w0[b - 1], hi = w0[b] - min;
  colDrag = { moved: false }; doc.classList.add('ed-colrz');
  const mv = ev => { const d = lo > hi ? 0 : Math.max(lo, Math.min(hi, (ev.clientX - x0) / tw * 100)); if (!colDrag.moved && Math.abs(ev.clientX - x0) < 2) return; colDrag.moved = true; const w = w0.slice(); w[b - 1] += d; w[b] -= d; tSetWidths(t, w); };
  const up = () => { removeEventListener('pointermove', mv, true); removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); const moved = colDrag.moved; colDrag = null; doc.classList.remove('ed-colrz'); if (moved) { colTap = null; touch(); } };
  addEventListener('pointermove', mv, true); addEventListener('pointerup', up, true); addEventListener('pointercancel', up, true);
}, true);
doc.addEventListener('mousedown', e => { if (e.button === 0 && !e.altKey && !editing && !board && !paint && colBorderAt(e)) e.preventDefault(); }, true);
/* ---------- table headers ----------
   A cell is ordinary (td), a header (th) or a sub header (th.sub). The four header buttons set that for the whole row or
   column the cursor is in, or for every row or column the selection covers; the same button again makes them ordinary.
   Any row can be changed, the top one included. A row counts as a header row when all its cells are headers; a column
   counts as a header column when its cells are headers in every ordinary row. */
function cellKind(x) { return x.tagName === 'TH' ? (x.classList.contains('sub') ? 'sub' : 'th') : null; }
function kindOf(cells) { const cs = [...new Set(cells.filter(Boolean))]; return cs.length && cs.every(x => x.tagName === 'TH') ? (cs.every(x => cellKind(x) === 'sub') ? 'sub' : 'th') : null; }
function tKinds(T) {
  // a row of headers and sub headers mixed is not a header row: its cells come from header columns
  const rowKind = T.M.map(m => { const cs = [...new Set(m.filter(Boolean))], k = kindOf(m); return k && cs.some(x => cellKind(x) !== k) ? null : k; }), W = T.M[0] ? T.M[0].length : 0, colKind = [], plain = T.M.filter((m, i) => !rowKind[i]);
  for (let k = 0; k < W; k++) colKind[k] = kindOf(plain.map(m => m[k]));
  return { rowKind, colKind };
}
/* Make a cell ordinary, a header or a sub header. A td cannot turn into a th in place, so it is replaced and the matrix follows. */
function tSetKind(T, x, kind) {
  let n = x; const tag = kind ? 'TH' : 'TD';
  if (x.tagName !== tag) { n = document.createElement(tag); [...x.attributes].forEach(a => n.setAttribute(a.name, a.value)); n.append(...x.childNodes); x.replaceWith(n); T.M.forEach(m => m.forEach((y, k) => { if (y === x) m[k] = n; })); }
  n.classList.toggle('sub', kind === 'sub'); if (!n.getAttribute('class')) n.removeAttribute('class'); if (!kind) n.removeAttribute('scope');
  return n;
}
/* What each header cell is a heading for, so a screen reader reads the table properly. */
function tScopes(T) { const { rowKind } = tKinds(T), seen = new Set(); T.M.forEach((m, i) => m.forEach(x => { if (!x || seen.has(x)) return; seen.add(x); if (x.tagName === 'TH') x.setAttribute('scope', rowKind[i] ? 'col' : 'row'); })); }
function tHeaderOp(T, c, op) {
  const want = op[0] === 'h' ? 'th' : 'sub', R = tGrow(T, tSelRect(T, c)), K = tKinds(T), s = getSelection(), keep = s.rangeCount ? [s.anchorNode, s.anchorOffset, s.focusNode, s.focusOffset] : null;
  let at = c; const set = (x, kind) => { const n = tSetKind(T, x, kind); if (x === at) at = n; };
  if (op[1] === 'r') {
    const rows = []; for (let i = R[0]; i <= R[2]; i++) rows.push(i);
    const off = rows.every(i => K.rowKind[i] === want); // turned off, a cell goes back to what its column makes it
    rows.forEach(i => { for (let k = 0; k < T.M[i].length; k++) { const x = T.M[i][k]; if (x) set(x, off ? K.colKind[k] : want); } });
  } else {
    const cols = []; for (let k = R[1]; k <= R[3]; k++) cols.push(k);
    let rows = T.M.map((m, i) => i).filter(i => !K.rowKind[i]); const none = !rows.length; if (none) rows = T.M.map((m, i) => i); // header rows keep their own look
    const off = cols.every(k => (none ? kindOf(T.M.map(m => m[k])) : K.colKind[k]) === want);
    rows.forEach(i => cols.forEach(k => { const x = T.M[i][k]; if (x) set(x, off ? null : want); }));
  }
  tScopes(T);
  let back = false; if (keep && doc.contains(keep[0]) && doc.contains(keep[2])) { try { s.setBaseAndExtent(...keep); lastRange = s.getRangeAt(0).cloneRange(); back = true; } catch (e) { } }
  if (!back) caret(at, true);
  cellSelPaint(); touch(); styleUI();
}
/* Which header buttons are lit for the cell the cursor is in. */
function tHeaderState(c) { const T = tMatrix(c.closest('table')), p = tPos(T, c); if (!p) return {}; const K = tKinds(T); return { hr: K.rowKind[p[0]] === 'th', sr: K.rowKind[p[0]] === 'sub', hc: !K.rowKind[p[0]] && K.colKind[p[1]] === 'th', sc: !K.rowKind[p[0]] && K.colKind[p[1]] === 'sub' }; }
function tSelRect(T, c) {
  if (cellSel && cellSel.t === T.t) { const info = cellSelInfo(); if (info) return info.R; }
  const s = getSelection(); let a = c, b = c;
  if (s.rangeCount && !s.isCollapsed) { const r = s.getRangeAt(0), f = n => { if (n.nodeType !== 1) n = n.parentElement; return n && n.closest('td,th'); }; const x = f(r.startContainer), y = f(r.endContainer); if (x && y && T.t.contains(x) && T.t.contains(y)) { a = x; b = y; } }
  const p = tExtent(T, a), q = tExtent(T, b); return [Math.min(p[0], q[0]), Math.min(p[1], q[1]), Math.max(p[2], q[2]), Math.max(p[3], q[3])];
}
function tGrow(T, R) {
  let [r1, c1, r2, c2] = R, changed = true;
  while (changed) { changed = false; for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const x = T.M[r][c]; if (!x) continue; const e = tExtent(T, x); if (e[0] < r1 || e[1] < c1 || e[2] > r2 || e[3] > c2) { r1 = Math.min(r1, e[0]); c1 = Math.min(c1, e[1]); r2 = Math.max(r2, e[2]); c2 = Math.max(c2, e[3]); changed = true; } } }
  return [r1, c1, r2, c2];
}
function tMerge(T, R) {
  const [r1, c1, r2, c2] = tGrow(T, R); if (r1 === r2 && c1 === c2) return false;
  if (T.rows[r1].sec !== T.rows[r2].sec) { alert('Heading cells and body cells cannot be merged together.'); return null; }
  const target = T.M[r1][c1], parts = [];
  for (let r = r1; r <= r2; r++) for (let c = c1; c <= c2; c++) { const x = T.M[r][c]; if (x && x !== target && !parts.includes(x)) parts.push(x); T.M[r][c] = target; }
  parts.forEach(x => { if (x.textContent.trim() || x.querySelector('img,svg')) { if (target.textContent.trim()) target.appendChild(document.createElement('br')); else target.innerHTML = ''; target.append(...x.childNodes); } });
  return target;
}
function tableOp(op) {
  live();
  const c = cell(); if (!c) { alert('Place the cursor in a table cell first.'); return; }
  const t = c.closest('table');
  if (op === 'dense') { t.classList.toggle('dense'); touch(); return; }
  const T = tMatrix(t), [r, col, r2, col2] = tExtent(T, c), W = T.M[0].length;
  const headRow = i => i >= 0 && i < T.rows.length && T.rows[i].sec.tagName === 'THEAD';
  if (op === 'hr' || op === 'sr' || op === 'hc' || op === 'sc') { tHeaderOp(T, c, op); return; }
  // set column widths follow the columns: a new column takes half of the one it was added beside, a deleted one gives its width back
  const CW0 = tWidths(t), CW = CW0 && CW0.length === W ? CW0 : null, halve = (from, at) => { if (CW) { const h = CW[from] / 2; CW[from] = h; CW.splice(at, 0, h); } };
  // a new row is ordinary apart from its header columns; a new column is ordinary apart from its header rows
  const K = tKinds(T), fresh = (n, kind, head) => { if (!kind && head) n.innerHTML = '<br>'; return tSetKind({ M: [] }, n, kind); };
  let focus = c;
  if (op === 'r+') {
    let at = r2, sec = T.rows[at].sec;
    if (headRow(at)) { sec = t.tBodies[0] || t.createTBody(); const first = T.rows.findIndex(x => x.sec === sec); at = (first < 0 ? T.rows.length : first) - 1; }
    const src = Math.max(0, at), tmpl = T.M[src] || [], next = T.M[at + 1], fromHead = headRow(src), tr = document.createElement('tr');
    if (!fromHead && T.rows[src].tr.className) tr.className = T.rows[src].tr.className;
    const row = []; for (let k = 0; k < W; k++) { const x = tmpl[k]; if (!fromHead && x && next && next[k] === x) { row[k] = x; continue; } row[k] = fresh(newCellLike(fromHead ? null : x, false), K.colKind[k]); }
    T.M.splice(at + 1, 0, row); T.rows.splice(at + 1, 0, { tr, sec });
    const after = T.rows[at + 2]; if (after && after.sec === sec) after.tr.before(tr); else sec.appendChild(tr);
    focus = row.find(x => x && !tmpl.includes(x)) || focus;
  }
  if (op === 'ra') {
    if (headRow(r)) { alert('A row cannot go above the heading row.'); return; }
    const sec = T.rows[r].sec, tmpl = T.M[r], prev = T.rows[r - 1] && T.rows[r - 1].sec === sec ? T.M[r - 1] : null, tr = document.createElement('tr');
    if (T.rows[r].tr.className) tr.className = T.rows[r].tr.className;
    const row = []; for (let k = 0; k < W; k++) { const x = tmpl[k]; if (x && prev && prev[k] === x) { row[k] = x; continue; } row[k] = fresh(newCellLike(x, false), K.colKind[k]); }
    T.rows[r].tr.before(tr); T.M.splice(r, 0, row); T.rows.splice(r, 0, { tr, sec });
    focus = row.find(x => x && !tmpl.includes(x)) || focus;
  }
  if (op === 'cl') {
    T.M.forEach((m, i) => { const x = m[col]; if (x && col > 0 && m[col - 1] === x) { m.splice(col, 0, x); return; } m.splice(col, 0, fresh(newCellLike(x, headRow(i)), K.rowKind[i], headRow(i))); });
    focus = T.M[r][col]; halve(col, col);
  }
  function dropTable() {   // one undo step; the cursor goes to the text after the table, or before it, or a new paragraph
    const w = t.closest('div.tw') || t, nx = w.nextElementSibling, pv = w.previousElementSibling;
    clearTimeout(timer); histSnap(); cellSelClear();
    let to = nx && nx.matches('p,h1,h2,h3,h4,h5,h6') ? nx : pv && pv.matches('p,h1,h2,h3,h4,h5,h6') ? pv : null;
    if (!to) { to = mk('p'); w.after(to); }
    w.remove(); touch(); caret(to, to === pv);
  }
  if (op === 'r-') {
    if (headRow(r)) { alert('The heading row stays; clear its text instead.'); return; }
    if (T.rows.filter(x => x.sec.tagName !== 'THEAD').length <= (r2 - r + 1)) return dropTable();   // the last body row: the table goes, as in Word
    T.M.splice(r, r2 - r + 1); T.rows.splice(r, r2 - r + 1).forEach(x => x.tr.remove()); focus = (T.M[r] || T.M[r - 1] || [])[col] || null;
  }
  if (op === 'c+') {
    T.M.forEach((m, i) => { const x = m[col2]; if (x && m[col2 + 1] === x) { m.splice(col2 + 1, 0, x); return; } m.splice(col2 + 1, 0, fresh(newCellLike(x, headRow(i)), K.rowKind[i], headRow(i))); });
    focus = T.M[r][col2 + 1]; halve(col2, col2 + 1);
  }
  if (op === 'c-') {
    if (W - (col2 - col + 1) < 1) return dropTable();   // the last column: the table goes, as in Word
    T.M.forEach(m => m.splice(col, col2 - col + 1)); if (CW) CW.splice(col, col2 - col + 1);
    focus = T.M[r][Math.min(col, T.M[r].length - 1)] || null;   // the cursor stays in the table, in the same row: the column now in that place, or the last one, so the next column can be deleted straight away
  }
  if (op === 'mr' || op === 'md') {
    let R = tSelRect(T, c);
    if (R[0] === r && R[1] === col && R[2] === r2 && R[3] === col2) {
      if (op === 'mr') { if (col2 + 1 >= W) { alert('There is no cell to the right.'); return; } R = [r, col, r2, col2 + 1]; }
      else { if (r2 + 1 >= T.M.length) { alert('There is no cell below.'); return; } R = [r, col, r2 + 1, col2]; }
    }
    const m = tMerge(T, R); if (m === null) return; focus = m || c;
  }
  if (op === 'split') {
    if (r2 > r || col2 > col) { for (let i = r; i <= r2; i++) for (let k = col; k <= col2; k++) if (i !== r || k !== col) T.M[i][k] = newCellLike(c, false); }
    else { T.M.forEach((m, i) => { const x = m[col]; m.splice(col + 1, 0, i === r ? newCellLike(c, headRow(i)) : x); }); focus = T.M[r][col + 1]; halve(col, col + 1); }
  }
  tRebuild(T); if (CW) tSetWidths(t, CW); cellSelClear(); touch(); if (focus && focus.isConnected) caret(focus, true);
}

function addStage() {
  const v = (prompt('Columns (excluding the label column), rows', '4,3') || '').split(',').map(Number); if (!v[0] || !v[1]) return;
  let h = '<div class="tw"><table class="lop"><thead><tr><th><br></th>' + '<th>Heading</th>'.repeat(v[0]) + '</tr></thead><tbody>';
  for (let r = 0; r < v[1]; r++) h += '<tr><th scope="row">Label</th>' + '<td><br></td>'.repeat(v[0]) + '</tr>';
  const n = el(h + '</tbody></table></div>'); insertBlock(n); n.after(el('<p><br></p>'));
}
/* Documents made before tables replaced grids: turn each grid into the equivalent table, keeping its content. */
function migrateGrids(root) {
  $$('div.lop, div.spine', root).forEach(g => {
    const spine = g.classList.contains('spine'), kids = [...g.children];
    let cols = kids.filter(k => k.matches(spine ? '.sh' : '.lh')).length;
    if (!cols) { const m = (g.getAttribute('style') || '').match(/repeat\((\d+)/); cols = m ? +m[1] + (spine ? 0 : 1) : (spine ? 4 : 5); }
    const t = document.createElement('table'); t.className = spine ? 'spine' : 'lop';
    const cellOf = (k, tag) => { const n = document.createElement(tag); n.innerHTML = k.innerHTML || '<br>'; return n; };
    let i = 0;
    if (kids[0] && kids[0].matches('.lh,.sh')) { const tr = t.createTHead().insertRow(); for (; i < cols && i < kids.length; i++) tr.appendChild(cellOf(kids[i], 'th')); }
    const tb = t.createTBody();
    for (; i < kids.length; i += cols) { const tr = tb.insertRow(); kids.slice(i, i + cols).forEach(k => { const n = cellOf(k, k.classList.contains('ll') ? 'th' : 'td'); if (n.tagName === 'TH') n.setAttribute('scope', 'row'); tr.appendChild(n); }); }
    const w = g.parentElement && g.parentElement.classList.contains('lopw') ? g.parentElement : g, tw = document.createElement('div'); tw.className = 'tw'; tw.appendChild(t); w.replaceWith(tw);
  });
}
/* ---------- Q&A lists ---------- */
function qaItem(r) {
  let n = r ? r.startContainer : (getSelection().rangeCount ? getSelection().anchorNode : null); if (!n) return null; if (n.nodeType !== 1) n = n.parentElement;
  const q = n && n.closest('dl.qa > dt, dl.qa > dd'); return q && doc.contains(q) && !q.closest('.fig') ? q : null;
}
function caret(node, atEnd) { const r = document.createRange(); r.selectNodeContents(node); r.collapse(!atEnd); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); }
function mk(tag, cls, html) { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html === undefined ? '<br>' : html; return e; }
function mergeQa(dl) { if (!dl) return; const nx = dl.nextElementSibling; if (nx && nx.matches('dl.qa')) { dl.append(...nx.childNodes); nx.remove(); } const pv = dl.previousElementSibling; if (pv && pv.matches('dl.qa')) { pv.append(...dl.childNodes); dl.remove(); } }
function splitOut(item, repl) {
  const dl = item.parentNode, rest = [...dl.children].slice([...dl.children].indexOf(item) + 1);
  dl.after(repl); if (rest.length) { const d2 = mk('dl', 'qa', ''); d2.append(...rest); repl.after(d2); }
  item.remove(); if (!dl.children.length) dl.remove();
}
function qaConvert(tag, cls) {
  const b = qaItem(lastRange) || curBlock(); if (!b) return; const html = b.innerHTML;
  if (b.matches('dl.qa > *')) {
    if (tag === 'dt' || tag === 'dd') { const e = mk(tag, '', html); b.replaceWith(e); caret(e, true); }
    else { const e = mk(tag, cls, html); splitOut(b, e); caret(e, true); }
  } else {
    const e = mk(tag, '', html), dl = mk('dl', 'qa', ''); dl.appendChild(e); b.replaceWith(dl); mergeQa(dl); caret(e, true);
  }
  touch(); styleUI();
}
/* The Q&A button works on the block the cursor is in, as the list buttons do: a paragraph or heading becomes a question
   (each one, when several are selected), and a question or answer goes back to a paragraph. A list item, table cell or
   code block cannot hold a Q&A list, so there it does nothing. */
function addQa() {
  live(); const r = lastRange; if (!r || !doc.contains(r.startContainer)) return; restore();
  if (qaItem(r)) { qaConvert('p'); return; }
  let n = r.startContainer; if (n.nodeType !== 1) n = n.parentElement; if (n.closest('li,td,th,pre,.fig,.dg,.note-log')) return;
  const blocks = $$('p,h2,h3,h4', doc).filter(b => (b.parentNode === doc || holds(b.parentNode)) && !b.matches('p.box-h') && (r.collapsed ? b.contains(r.startContainer) : r.intersectsNode(b)));
  if (!r.collapsed && r.endOffset === 0 && blocks.length > 1 && blocks[blocks.length - 1].contains(r.endContainer)) blocks.pop();
  if (!blocks.length) return; let last = null;
  blocks.forEach(b => {
    const e = mk('dt', '', hasContent(b) ? b.innerHTML : '<br>'), prev = b.previousElementSibling;
    if (prev && prev.matches('dl.qa')) { prev.appendChild(e); b.remove(); } else { const dl = mk('dl', 'qa', ''); dl.appendChild(e); b.replaceWith(dl); }
    last = e;
  });
  mergeQa(last.parentNode); caret(last, true); touch(); styleUI();
}
function frag(r) { const f = r.cloneContents(), out = []; const w = document.createTreeWalker(f, NodeFilter.SHOW_ALL); let n; while ((n = w.nextNode())) out.push(n); return out; }
function lineText(nodes, reverse) { let t = ''; for (const n of (reverse ? nodes.reverse() : nodes)) { if (n.nodeName === 'BR') break; if (n.nodeType === 3) t += n.data; } return t.trim(); }
function qaEnter(item, shift) {
  const s = getSelection(), r = s.getRangeAt(0);
  if (shift) { lineBreak(); touch(); return; }
  if (item.tagName === 'DT') {
    if (!item.textContent.trim()) { const p = mk('p'); splitOut(item, p); caret(p); touch(); return; }
    let dd = item.nextElementSibling; if (!dd || dd.tagName !== 'DD') { dd = mk('dd'); item.after(dd); }
    caret(dd, true); touch(); return;
  }
  const after = document.createRange(); after.setStart(r.endContainer, r.endOffset); after.setEnd(item, item.childNodes.length);
  const before = document.createRange(); before.setStart(item, 0); before.setEnd(r.startContainer, r.startOffset);
  let lead = frag(before).filter(n => !(n.parentElement && n.parentElement.closest('ul,ol'))); { let cut = -1; lead.forEach((n, i) => { if (n.nodeType === 1 && /^(UL|OL)$/.test(n.tagName)) cut = i; }); lead = lead.slice(cut + 1); } // a list in the answer ends the line before it
  const atEnd = !after.toString().trim(), empty = atEnd && !lineText(lead, true);
  if (!empty) { lineBreak(); touch(); return; }
  while (item.lastChild && (item.lastChild.nodeName === 'BR' || (item.lastChild.nodeType === 3 && !item.lastChild.data.trim()))) item.lastChild.remove();
  const dt = mk('dt'); item.after(dt); if (!item.textContent.trim()) item.remove(); caret(dt); touch();
}
/* ---------- diagrams ---------- */
const scale = () => board.getBoundingClientRect().width / board.offsetWidth;
function R(e) { const s = e.style; return { x: parseFloat(s.left) || 0, y: parseFloat(s.top) || 0, w: e.offsetWidth || parseFloat(s.width) || 0, h: e.offsetHeight || parseFloat(s.height) || 0 }; }
function isSvg(e) { return e.tagName.toLowerCase() === 'svg'; }
function rank(e) {
  if (e.classList.contains('wb-group')) return 0; if (isSvg(e)) return 1;
  if (e.matches('.wb-box,.wb-layer')) return 2; if (e.matches('.wb-badge,.wb-marker')) return 3;
  if (e.classList.contains('wb-conn')) return 8; if (e.classList.contains('ed-handle')) return 9; return 4;
}
function put(e) { const r = rank(e); const before = [...board.children].find(c => rank(c) > r); board.insertBefore(e, before || null); }
function snapshot() { undo.push({ b: board, html: board.innerHTML }); if (undo.length > 60) undo.shift(); }
function undoDiagram() {
  const u = undo.pop(); if (!u || !doc.contains(u.b)) return; activate(u.b); sel = null; selC = null;
  u.b.innerHTML = u.html; $$('.ed-handle', u.b).forEach(n => n.remove()); $$('.ed-sel,.ed-selc,.ed-from', u.b).forEach(n => n.classList.remove('ed-sel', 'ed-selc', 'ed-from'));
  updateBar(); touch();
}
function activate(b) { if (board === b) return; deactivate(); board = b; b.classList.add('ed-active'); dbar.hidden = false; updateBar(); chromeHeight(); }
function deactivate() { if (!board) return; endEdit(); select(null); setMode(null); board.classList.remove('ed-active'); board = null; dbar.hidden = true; chromeHeight(); }
function setMode(m) { mode = m; if (connFrom) connFrom.classList.remove('ed-from'); connFrom = null; if (board) board.classList.toggle('ed-connect', m === 'connect'); $('#b-connect').classList.toggle('on', m === 'connect'); }

function placeHandle() {
  $$('.ed-handle', board).forEach(n => n.remove());
  if (!sel || isSvg(sel) || sel.classList.contains('wb-badge')) return;
  const r = R(sel), h = el('<div class="ed-handle"></div>'); h.style.left = (r.x + r.w - 4) + 'px'; h.style.top = (r.y + r.h - 4) + 'px'; board.appendChild(h);
}
function select(it) {
  if (!board) return;
  $$('.ed-sel,.ed-selc', board).forEach(n => n.classList.remove('ed-sel', 'ed-selc'));
  sel = it; selC = null; if (it) it.classList.add('ed-sel'); placeHandle(); updateBar();
}
function selectConn(id) {
  select(null); selC = id; $$('[data-conn="' + id + '"]', board).forEach(n => n.classList.add('ed-selc')); updateBar();
}
function stateOf(e) { const m = [...e.classList].find(c => c.startsWith('is-')); return m || ''; }
function updateBar() {
  if (!board) return;
  const k = sel ? (sel.matches('.wb-box,.wb-layer') ? 'box' : sel.matches('.wb-callout,.wb-badge') ? 'state' : 'other') : selC ? 'conn' : 'board';
  $('#g-box').hidden = k !== 'box'; $('#g-state').hidden = k !== 'state'; $('#g-conn').hidden = k !== 'conn'; $('#g-board').hidden = k !== 'board';
  $('#g-item').hidden = !(sel || selC);
  if (k === 'box') $('#s-box').value = stateOf(sel);
  if (k === 'state') $('#s-state').value = stateOf(sel).slice(3);
  if (k === 'conn') { const c = board.querySelector('#' + selC); if (c) { $('#s-fs').value = c.dataset.fs; $('#s-ts').value = c.dataset.ts; $('#s-type').value = c.dataset.type || ''; $('#s-head').checked = c.dataset.head !== '0'; $('#s-label').value = c.dataset.label || ''; } }
  if (k === 'board') { $('#s-w').value = parseFloat(board.style.width); $('#s-h').value = parseFloat(board.style.height); $('#s-aria').value = board.getAttribute('aria-label') || ''; }
}

/* connectors */
const TYPES = { '': ['', '#12355B'], planned: ['is-planned', '#12355B'], async: ['is-async', '#12355B'], retire: ['is-retire', '#5F6B7A'], note: ['is-note', '#B23C0B'] };
function segment(p, q, cls, head, color, cid) {
  const horiz = p.y === q.y, n = Math.abs(horiz ? q.x - p.x : q.y - p.y), h = head ? 5 : 0, mid = 'wb-head-' + uid();
  let d, w, hh, l, t;
  if (horiz) { l = Math.min(p.x, q.x); t = p.y - 4; w = n; hh = 8; d = q.x > p.x ? `M 0 4 L ${n - h} 4` : `M ${n} 4 L ${h} 4`; }
  else { l = p.x - 4; t = Math.min(p.y, q.y); w = 8; hh = n; d = q.y > p.y ? `M 4 0 L 4 ${n - h}` : `M 4 ${n} L 4 ${h}`; }
  const defs = head ? `<defs><marker id="${mid}" orient="auto" markerWidth="5" markerHeight="5" refX="2" refY="2" overflow="visible"><path d="M0 0 L4 2 L0 4 Z" fill="${color}" stroke="none"/></marker></defs>` : '';
  return el(`<svg class="wb-arrow ${cls}" data-conn="${cid}" width="${w}" height="${hh}" viewBox="0 0 ${w} ${hh}" style="left: ${l}px; top: ${t}px; width: ${w}px; height: ${hh}px" aria-hidden="true">${defs}<path d="${d}"${head ? ` marker-end="url(#${mid})"` : ''}/></svg>`);
}
function render(c) {
  $$('[data-conn="' + c.id + '"]', board).forEach(n => n.remove());
  const A = board.querySelector('#' + c.dataset.from), B = board.querySelector('#' + c.dataset.to);
  if (!A || !B) { c.remove(); return; }
  const a = R(A), b = R(B), fs = c.dataset.fs, ts = c.dataset.ts, H = s => s === 'l' || s === 'r';
  const P = (r, s) => ({ x: Math.round(s === 'l' ? r.x : s === 'r' ? r.x + r.w : r.x + r.w / 2), y: Math.round(s === 't' ? r.y : s === 'b' ? r.y + r.h : r.y + r.h / 2) });
  const p0 = P(a, fs), p1 = P(b, ts); let pts;
  if (H(fs) && H(ts)) {
    if (fs === ts) { const x = fs === 'r' ? Math.max(p0.x, p1.x) + 32 : Math.min(p0.x, p1.x) - 32; pts = [p0, { x, y: p0.y }, { x, y: p1.y }, p1]; }
    else if (p0.y === p1.y) pts = [p0, p1];
    else { const x = Math.round((p0.x + p1.x) / 16) * 8; pts = [p0, { x, y: p0.y }, { x, y: p1.y }, p1]; }
  } else if (!H(fs) && !H(ts)) {
    if (fs === ts) { const y = fs === 'b' ? Math.max(p0.y, p1.y) + 32 : Math.min(p0.y, p1.y) - 32; pts = [p0, { x: p0.x, y }, { x: p1.x, y }, p1]; }
    else if (p0.x === p1.x) pts = [p0, p1];
    else { const y = Math.round((p0.y + p1.y) / 16) * 8; pts = [p0, { x: p0.x, y }, { x: p1.x, y }, p1]; }
  } else if (H(fs)) pts = [p0, { x: p1.x, y: p0.y }, p1];
  else pts = [p0, { x: p0.x, y: p1.y }, p1];
  const head = c.dataset.head !== '0', ty = TYPES[c.dataset.type || ''] || TYPES[''];
  if (head) { const q = pts[pts.length - 1], p = pts[pts.length - 2]; if (p.x === q.x) q.y += q.y > p.y ? -1 : 1; else q.x += q.x > p.x ? -1 : 1; }
  const segs = []; for (let i = 0; i < pts.length - 1; i++) if (pts[i].x !== pts[i + 1].x || pts[i].y !== pts[i + 1].y) segs.push([pts[i], pts[i + 1]]);
  segs.forEach((s, i) => put(segment(s[0], s[1], ty[0], head && i === segs.length - 1, ty[1], c.id)));
  if (c.dataset.label && segs.length) {
    const len = s => Math.abs(s[0].x - s[1].x) + Math.abs(s[0].y - s[1].y), s = segs.reduce((m, x) => len(x) > len(m) ? x : m);
    const v = el('<div class="wb-arrow-label er-verb" data-conn="' + c.id + '"></div>'); v.textContent = c.dataset.label;
    v.style.left = ((s[0].x + s[1].x) / 2) + 'px'; v.style.top = ((s[0].y + s[1].y) / 2 - 11) + 'px'; v.style.transform = 'translateX(-50%)'; put(v);
  }
  if (selC === c.id) $$('[data-conn="' + c.id + '"]', board).forEach(n => n.classList.add('ed-selc'));
}
function updateConns(id) { $$('.wb-conn', board).forEach(c => { if (!id || c.dataset.from === id || c.dataset.to === id) render(c); }); }
function connect(A, B) {
  const a = R(A), b = R(B), dx = (b.x + b.w / 2) - (a.x + a.w / 2), dy = (b.y + b.h / 2) - (a.y + a.h / 2);
  const s = Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? ['r', 'l'] : ['l', 'r']) : (dy > 0 ? ['b', 't'] : ['t', 'b']);
  snapshot(); const c = el('<span class="wb-conn" hidden></span>'); c.id = uid();
  Object.assign(c.dataset, { from: A.id, to: B.id, fs: s[0], ts: s[1], type: A.classList.contains('wb-note') ? 'note' : '', head: '1' });
  put(c); render(c); selectConn(c.id); touch();
}

/* items */
function spot(w, h) { const W = parseFloat(board.style.width), Hh = parseFloat(board.style.height); const k = (cascade++ % 6) * 32; return [snap(W / 2 - w / 2 + k), snap(Hh / 2 - h / 2 + k)]; }
function add(node, w, h, at) {
  snapshot(); const p = at || spot(w || 144, h || 64); node.id = uid(); node.style.left = p[0] + 'px'; node.style.top = p[1] + 'px';
  if (w) node.style.width = w + 'px'; if (h) node.style.height = h + 'px'; put(node); select(node); touch(); return node;
}
const ADD = {
  box: () => add(el('<div class="wb-box"><span>Label</span></div>'), 144, 64),
  group: () => add(el('<div class="wb-group"></div>'), 320, 160),
  title: () => add(el('<div class="wb-title">Diagram title</div>'), 0, 0, [64, 40]),
  subtitle: () => add(el('<div class="wb-subtitle">Subtitle</div>'), 0, 0, [64, 90]),
  label: () => add(el('<div class="wb-arrow-label">label</div>')),
  note: () => add(el('<div class="wb-note">annotation</div>')),
  question: () => add(el('<div class="wb-question">&#8594; Question?</div>')),
  legend: () => add(el('<div class="wb-legend lg">key = meaning</div>')),
  callout: () => add(el('<div class="wb-callout is-note">' + ICONS.note + '<span><b>Title</b>Body text</span></div>'), 272, 0),
  badge: () => add(el('<span class="wb-badge is-new">NEW</span>')),
  divider: () => add(el('<div class="wb-divider"></div>'), parseFloat(board.style.width) - 128, 0, [64, parseFloat(board.style.height) - 144]),
};
function remove() {
  if (selC) { snapshot(); const id = selC; selC = null; $$('[data-conn="' + id + '"]', board).forEach(n => n.remove()); const c = board.querySelector('#' + id); if (c) c.remove(); updateBar(); touch(); return; }
  if (!sel) return; snapshot(); const id = sel.id; sel.remove(); sel = null;
  $$('.wb-conn', board).forEach(c => { if (c.dataset.from === id || c.dataset.to === id) { $$('[data-conn="' + c.id + '"]', board).forEach(n => n.remove()); c.remove(); } });
  placeHandle(); updateBar(); touch();
}
function duplicate() {
  if (!sel) return; snapshot(); const n = sel.cloneNode(true); n.classList.remove('ed-sel'); n.id = uid(); const r = R(sel);
  n.style.left = (r.x + 16) + 'px'; n.style.top = (r.y + 16) + 'px'; put(n); select(n); touch();
}
function setBoxStyle(v) {
  if (!sel) return; snapshot(); [...sel.classList].filter(c => c.startsWith('is-')).forEach(c => sel.classList.remove(c)); if (v) sel.classList.add(v);
  $$(':scope > svg', sel).forEach(n => n.remove()); const st = v.slice(3); if (ICONS[st]) sel.prepend(el(ICONS[st])); updateConns(sel.id); touch();
}
function setState(v) {
  if (!sel) return; snapshot(); [...sel.classList].filter(c => c.startsWith('is-')).forEach(c => sel.classList.remove(c)); sel.classList.add('is-' + v);
  if (sel.classList.contains('wb-callout')) { $$(':scope > svg', sel).forEach(n => n.remove()); if (ICONS[v]) sel.prepend(el(ICONS[v])); }
  touch();
}
function setConn() {
  const c = selC && board.querySelector('#' + selC); if (!c) return; snapshot();
  Object.assign(c.dataset, { fs: $('#s-fs').value, ts: $('#s-ts').value, type: $('#s-type').value, head: $('#s-head').checked ? '1' : '0', label: $('#s-label').value }); render(c); touch();
}
function setBoard() {
  snapshot(); const w = Math.max(320, +$('#s-w').value || 960), h = Math.max(240, +$('#s-h').value || 600);
  board.style.width = w + 'px'; board.style.height = h + 'px'; board.setAttribute('aria-label', $('#s-aria').value); fit(); touch();
}
function newDiagram() {
  const f = el('<div class="fig" contenteditable="false"><div class="wb-board" style="width: 960px; height: 600px" role="img" aria-label="Diagram"></div></div>');
  insertBlock(f); f.after(el('<p class="cap">Figure. Caption</p>')); fit(); activate(f.firstElementChild); ADD.title(); ADD.subtitle(); select(null); undo = [];
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}
function deleteDiagram() { if (!board || !confirm('Delete this diagram?')) return; const f = board.parentNode; deactivate(); f.remove(); touch(); }

/* text inside diagram items */
function startEdit(it) {
  let t = it; if (it.matches('.wb-box,.wb-layer')) { t = $(':scope > span', it); if (!t) { t = document.createElement('span'); while (it.firstChild) t.appendChild(it.firstChild); it.appendChild(t); } }
  else if (it.classList.contains('wb-callout')) t = $(':scope > span', it) || it;
  else if (isSvg(it) || it.matches('.wb-group,.wb-divider')) return;
  snapshot(); editing = t; t.setAttribute('contenteditable', 'true'); t.focus(); const r = document.createRange(); r.selectNodeContents(t); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  t.addEventListener('blur', endEdit, { once: true });
}
function endEdit() { if (!editing) return; const t = editing; editing = null; t.removeAttribute('contenteditable'); if (board) { updateConns(); placeHandle(); } touch(); }

/* pointer */
function itemAt(target, b) { let it = target; while (it && it.parentNode !== b) it = it.parentNode; return it; }
doc.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]'); if (!a || !doc.contains(a)) return;
  e.preventDefault(); if (!(e.ctrlKey || e.metaKey)) return;
  const h = a.getAttribute('href');
  if (h.startsWith('#')) { const t = document.getElementById(h.slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth' }); return; }
  if (SAFE_URL.test(h)) window.open(a.href, '_blank', 'noopener,noreferrer');
});
doc.addEventListener('mouseover', e => { const a = e.target.closest && e.target.closest('a[href]'); if (a && doc.contains(a) && !a.hasAttribute('title')) { a.setAttribute('title', a.getAttribute('href') + '  (Ctrl or Cmd + click to open)'); a.dataset.edTitle = '1'; } });
doc.addEventListener('mouseout', e => { const a = e.target.closest && e.target.closest('a[data-ed-title]'); if (a) { a.removeAttribute('title'); delete a.dataset.edTitle; } });
doc.addEventListener('pointerdown', e => {
  if (e.button === 0 && gapPara(e)) return;
  const g = e.target.closest('.dg, .fig') || pictureAt(e.target); dgSelect(g || null); if (g) { deactivate(); e.preventDefault(); return; }
  const b = e.target.closest('.wb-board'); if (!b) { deactivate(); return; }
  if (editing && editing.contains(e.target)) return;
  endEdit(); activate(b);
  if (e.target.classList.contains('ed-handle')) { startResize(e); e.preventDefault(); return; }
  const it = itemAt(e.target, b);
  if (!it) { select(null); if (mode) setMode(null); e.preventDefault(); return; }
  if (it.dataset.conn) { selectConn(it.dataset.conn); e.preventDefault(); return; }
  if (mode === 'connect') {
    if (!connFrom) { connFrom = it; it.classList.add('ed-from'); } else if (it !== connFrom) { const a = connFrom; setMode(null); connect(a, it); }
    e.preventDefault(); return;
  }
  select(it); startDrag(e, it); e.preventDefault();
});
doc.addEventListener('dblclick', e => {
  const g = e.target.closest('.dg, .fig') || pictureAt(e.target); if (g) { e.preventDefault(); openDiagram(g); return; } const b = e.target.closest('.wb-board'); if (!b || editing) return; const it = itemAt(e.target, b); if (it && !it.dataset.conn) startEdit(it); });
function startDrag(e, it) {
  const r = R(it), sx = e.clientX, sy = e.clientY, sc = scale(); let moved = false;
  const mv = ev => {
    const dx = (ev.clientX - sx) / sc, dy = (ev.clientY - sy) / sc; if (!moved && Math.abs(dx) + Math.abs(dy) < 3) return;
    if (!moved) { snapshot(); moved = true; }
    it.style.left = snap(r.x + dx, ev) + 'px'; it.style.top = snap(r.y + dy, ev) + 'px'; updateConns(it.id); placeHandle();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); if (moved) touch(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
function startResize(e) {
  const it = sel, r = R(it), sx = e.clientX, sy = e.clientY, sc = scale(); snapshot();
  const both = it.matches('.wb-box,.wb-layer,.wb-group');
  const mv = ev => {
    it.style.width = Math.max(16, snap(r.w + (ev.clientX - sx) / sc, ev)) + 'px';
    if (both) it.style.height = Math.max(16, snap(r.h + (ev.clientY - sy) / sc, ev)) + 'px';
    updateConns(it.id); placeHandle();
  };
  const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); touch(); };
  addEventListener('pointermove', mv); addEventListener('pointerup', up);
}
document.addEventListener('keydown', e => {
  const k = e.key, ctrl = e.ctrlKey || e.metaKey;
  if (DE.open) return;
  if (NB.textOn && NB.textOn()) { if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); } else if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); open(); } return; }   // the text editor has the keys; only Save and Open are the program's
  if (ctrl && !e.altKey && !board && !e.target.closest('#chrome') && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) { e.preventDefault(); histGo(k.toLowerCase() === 'y' || e.shiftKey ? 1 : -1); return; }
  if (dgSel && ctrl && !e.shiftKey && !e.altKey && !e.target.closest('#chrome') && (k.toLowerCase() === 'c' || k.toLowerCase() === 'x')) { e.preventDefault(); dgCopy(k.toLowerCase() === 'x'); return; }
  if (dgSel && !ctrl && !e.target.closest('#chrome')) { if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); dgDelete(); return; } if (k === 'Enter') { e.preventDefault(); openDiagram(dgSel); return; } if (k === 'Escape') { dgSelect(null); return; } }
  if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); open(); return; }
  if (k === 'Backspace' && !ctrl && !e.altKey && !editing && !board && checkStart()) { e.preventDefault(); clearTimeout(timer); histSnap(); document.execCommand('insertUnorderedList'); touch(); styleUI(); return; }
  if (k === 'Tab' && !ctrl && !e.altKey && !editing) { const c = cellEl(); if (c) { e.preventDefault(); cellTab(c, e.shiftKey); return; } }
  if (k === 'Tab' && !ctrl && !e.altKey && !editing && !board && doc.contains(e.target) && listAt() && !blockOf(getSelection().anchorNode)) { e.preventDefault(); clearTimeout(timer); histSnap(); const out = e.shiftKey; if (listShift(out ? -1 : 1)) repSet(out ? 'Outdent' : 'Indent', () => listShift(out ? -1 : 1)); return; }
  if ((k === 'ArrowDown' || k === 'ArrowUp') && !e.shiftKey && !ctrl && !e.altKey && !editing) { const c = cellEl(); if (c && cellArrow(c, k === 'ArrowDown')) { e.preventDefault(); return; } }
  if ((k === 'Enter' || k === 'Backspace') && !ctrl && !e.altKey && !e.shiftKey && !editing && !board) { const li = qaListItem(), g = getSelection(); if (li && g.isCollapsed) {
    const own = [...li.childNodes].filter(n => !(n.nodeType === 1 && n.matches('ul,ol,input'))), empty = !own.some(n => n.nodeType === 3 ? n.data.trim() : n.nodeName !== 'BR');
    const pre = document.createRange(); pre.setStart(li, 0); pre.setEnd(g.anchorNode, g.anchorOffset);
    if (k === 'Enter' ? empty && !li.querySelector('ul,ol') : !pre.toString()) { e.preventDefault(); clearTimeout(timer); histSnap(); listShift(-1); return; } // an empty item, or Backspace at the start of one, leaves the list and stays in the answer
  } }
  if (k === 'Enter' && !ctrl && !e.altKey && !editing) { const q = qaItem(); if (q && !qaListItem()) { e.preventDefault(); qaEnter(q, e.shiftKey); return; } }
  if (!editing && !ctrl && !e.altKey && (k === 'Enter' || k === 'Tab')) { const pre = blockOf(getSelection().anchorNode); if (pre) { e.preventDefault(); if (k === 'Tab') { if (!e.shiftKey) codeInsert('\t'); } else if (e.shiftKey) { document.execCommand('insertLineBreak'); touch(); } else codeEnter(pre); return; } }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing) { const s1 = getSelection(); let n1 = s1.anchorNode; if (n1 && n1.nodeType !== 1) n1 = n1.parentElement; const lp = n1 && n1.closest('.note-entries > p'); if (lp && doc.contains(lp)) { e.preventDefault(); const who = initials(); if (!who) return; const line = mk('p', '', '<b class="note-who"></b>&nbsp;'); line.firstChild.textContent = who; lp.after(line); caret(line, true); touch(); return; } }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing && !inCell()) {
    const s2 = getSelection(); let n2 = s2.anchorNode; if (n2 && n2.nodeType !== 1) n2 = n2.parentElement; const bp = n2 && n2.closest('.box > p');
    if (bp && doc.contains(bp) && !bp.closest('.fig,.dg')) {
      const bx = bp.parentNode;
      if (bp.classList.contains('box-h')) { e.preventDefault(); clearTimeout(timer); histSnap(); const q = mk('p'); bp.after(q); caret(q); touch(); styleUI(); return; } // from the label into the box
      if (!bp.textContent.trim() && !bp.querySelector('img') && !bp.nextElementSibling && bp.previousElementSibling) { e.preventDefault(); clearTimeout(timer); histSnap(); bp.remove(); const q = mk('p'); bx.after(q); if (bx.children.length === 1 && boxLabel(bx)) bx.remove(); caret(q); touch(); styleUI(); return; } // an empty last line leaves the box
    }
  }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing && !inCell()) { const s0 = getSelection(); let n0 = s0.anchorNode; if (n0 && n0.nodeType !== 1) n0 = n0.parentElement; const pb = n0 && n0.closest('.note-body > p'); if (pb && !pb.textContent.trim() && !pb.nextElementSibling && pb.previousElementSibling) { e.preventDefault(); const note = pb.closest('.note'); pb.remove(); const q = mk('p'); note.after(q); caret(q); touch(); styleUI(); return; } }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing && !inCell()) { const p = styledParaEnd(); if (p) { e.preventDefault(); const n = mk('p'); p.after(n); caret(n); touch(); styleUI(); return; } }
  if (k === 'Enter' && e.shiftKey && !ctrl && !e.altKey && !editing && !board && doc.contains(e.target) && !inCell() && tagEdge()) { e.preventDefault(); lineBreak(); touch(); return; }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing && !board && doc.contains(e.target) && !inCell() && enterAfterTag()) { e.preventDefault(); return; }
  if (k === 'Enter' && !ctrl && !e.altKey && !editing && inCell()) { e.preventDefault(); lineBreak(); touch(); return; }
  if (editing) { if (k === 'Enter' && !e.shiftKey) { e.preventDefault(); document.execCommand('insertLineBreak'); } if (k === 'Escape') editing.blur(); return; }
  if (!board || e.target.closest('#chrome')) return;
  if (ctrl && k.toLowerCase() === 'z') { e.preventDefault(); undoDiagram(); return; }
  if (ctrl && k.toLowerCase() === 'd') { e.preventDefault(); duplicate(); return; }
  if (k === 'Escape') { select(null); setMode(null); return; }
  if (!sel && !selC) return;
  if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); remove(); return; }
  if (k === 'Enter' && sel) { e.preventDefault(); startEdit(sel); return; }
  const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
  if (d && sel) { e.preventDefault(); snapshot(); const st = e.shiftKey ? 1 : 8, r = R(sel); sel.style.left = (r.x + d[0] * st) + 'px'; sel.style.top = (r.y + d[1] * st) + 'px'; updateConns(sel.id); placeHandle(); touch(); }
});

function cellEl() {
  const s = getSelection(); if (!s.rangeCount) return null; let n = s.anchorNode; if (n && n.nodeType !== 1) n = n.parentElement;
  if (!n || !doc.contains(n) || n.closest('.fig') || n.closest('li')) return null;
  const c = n.closest('td,th'); return c && doc.contains(c) ? c : null;
}
function neighbourCell(c, dir) {
  const T = tMatrix(c.closest('table')), [r, col, , col2] = tExtent(T, c), m = T.M[r];
  if (dir > 0) return m[col2 + 1] || null;
  return col > 0 ? m[col - 1] || null : null;
}
function cellTab(c, shift) {
  const r = getSelection().getRangeAt(0);
  if (shift) { const p = neighbourCell(c, -1); if (p) caret(p, true); return; }
  const after = document.createRange(); after.setStart(r.endContainer, r.endOffset); after.setEnd(c, c.childNodes.length);
  if (!lineText(frag(after), false)) { const nx = neighbourCell(c, 1); if (nx) caret(nx, true); return; }
  document.execCommand('insertText', false, '\u00a0\u00a0\u00a0\u00a0'); touch();
}
function inCell() { return !!cellEl(); }
function caretRect() {
  const s = getSelection(), r = s.getRangeAt(0); const q = r.getClientRects(); if (q.length && q[q.length - 1].height) return q[q.length - 1];
  const z = document.createTextNode('\u200b'); r.insertNode(z); const zr = document.createRange(); zr.selectNodeContents(z); const rect = zr.getBoundingClientRect();
  const parent = z.parentNode, next = z.nextSibling; z.remove(); const back = document.createRange();
  if (next && next.parentNode === parent) back.setStartBefore(next); else back.setStart(parent, parent.childNodes.length);
  back.collapse(true); s.removeAllRanges(); s.addRange(back); return rect;
}
function cellArrow(c, down) {
  const rc = caretRect(), r = getSelection().getRangeAt(0), rest = document.createRange();
  if (down) { rest.setStart(r.endContainer, r.endOffset); rest.setEnd(c, c.childNodes.length); } else { rest.setStart(c, 0); rest.setEnd(r.startContainer, r.startOffset); }
  if ([...rest.getClientRects()].some(q => q.height > 0 && (down ? q.top >= rc.bottom - 2 : q.bottom <= rc.top + 2))) return false;
  const t = c.closest('table'), T = tMatrix(t), [r1, c1, r2] = tExtent(T, c), m = T.M[down ? r2 + 1 : r1 - 1];
  let target = m ? (m[c1] || null) : null;
  if (!target) { const w = t.parentElement && t.parentElement.classList.contains('tw') ? t.parentElement : t, nb = down ? w.nextElementSibling : w.previousElementSibling; if (!nb) return false; caret(nb, !down); return true; }
  target.scrollIntoView({ block: 'nearest' });
  const all = document.createRange(); all.selectNodeContents(target); const lines = [...all.getClientRects()].filter(q => q.height > 0);
  const box = target.getBoundingClientRect(), line = lines.length ? (down ? lines[0] : lines[lines.length - 1]) : null;
  const y = line ? line.top + line.height / 2 : box.top + box.height / 2, x = Math.min(Math.max(rc.left, box.left + 4), box.right - 4);
  const p = document.caretRangeFromPoint ? document.caretRangeFromPoint(x, y) : null;
  if (p && target.contains(p.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(p); lastRange = p.cloneRange(); } else caret(target, !down);
  return true;
}

/* ---------- full diagrams: the built-in diagram editor ----------
   A diagram is stored in the document as <div class="dg" data-drawio="draw.io XML">inline SVG</div>.
   Editing opens the diagram editor (vendor/diagram-editor.html, base64 in #de-src) in an iframe overlay
   and talks to it with the embed messages: de:ready, de:init, de:save, de:cancel, de:dirty. */
const DE = { frame: null, ready: false, pending: null, target: null, open: false, kind: null, src: null, queue: [], jobs: new Map(), seq: 0 };
let dgSel = null, mmSel = null;
function deSource() {
  if (DE.src) return DE.src;
  const bin = atob($('#de-src').textContent.trim()), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return (DE.src = new TextDecoder().decode(u));
}
function deFrame() {
  if (DE.frame) return DE.frame;
  DE.frame = $('#de-frame'); DE.frame.srcdoc = deSource(); return DE.frame;
}
function dgTitle(fig) {
  let p = fig && fig.nextElementSibling; const cap = p && p.classList.contains('cap') ? p.textContent.trim() : '';
  if (cap) return cap.replace(/^Figure\s*\d*\.?\s*/i, '').slice(0, 200) || 'Diagram';
  const h = fig && fig.querySelector('svg title'); return h ? h.textContent.trim() : 'Diagram';
}
/* What the diagram editor says when a picture or a Mermaid definition was converted to open it: where it came from, that
   the look may differ, that nothing changes until Done, and what was recognised. */
function convNotice(fig, conv) {
  const r = conv.report || {}, pic = fig.matches('svg'), n = (k, w) => (k || 0) + ' ' + w + (k === 1 ? '' : 's');
  const got = pic ? n((r.boxes || 0) + (r.diamonds || 0) + (r.ellipses || 0), 'shape') + ' and ' + n((r.arrows || 0) + (r.lines || 0), 'line') + ' recognised' + (r.skipped ? ', ' + n(r.skipped, 'part') + ' skipped' : '')
    : n(r.shapes, 'shape') + ' and ' + n(r.links, 'link') + ' recognised';
  return 'Converted from ' + (pic ? 'a picture' : 'a Mermaid definition') + '. Layout and text formatting may differ from the original. The page is unchanged until you click Done; Cancel keeps the ' + (pic ? 'picture' : 'definition') + '. (' + got + ')';
}
function openDiagram(fig) {
  if (fig && fig.classList.contains('dm')) return openDataModel(fig);   // a data model opens in Data Model Studio
  if (DE.open) return;
  /* a picture or a Mermaid definition from elsewhere is converted first; if nothing in it is recognised it is left as it is */
  const conv = fig && !fig.matches('.dg, .fig') ? drawingToDrawio(fig) : null;
  if (conv && conv.error) { alert(conv.error); return; }
  deactivate(); dgSelect(null);
  DE.target = fig || null; DE.open = true; DE.kind = 'de';
  const board = fig && fig.querySelector('.wb-board');
  const xml = !fig ? '' : conv ? conv.xml : board ? boardToDrawio(board) : (fig.getAttribute('data-drawio') || '');
  const msg = { type: 'de:init', xml, title: conv ? conv.name : dgTitle(fig), mode: 'blueprint', appTheme: appTheme() };
  if (conv) msg.notice = convNotice(fig, conv);   // a conversion says so, in a bar above the diagram, so a different look is not taken for lost formatting
  $('#de-overlay').classList.remove('de-quiet'); $('#de-overlay').hidden = false; document.documentElement.classList.add('de-open');
  deFrame(); deFocus();
  if (DE.ready) DE.frame.contentWindow.postMessage(msg, '*'); else DE.pending = msg;
}
/* The keys go to the diagram editor once it is open, so Ctrl+V pastes into the diagram, never into the page behind it. */
function deFocus() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); getSelection().removeAllRanges(); try { DE.frame.focus(); DE.frame.contentWindow.focus(); } catch (e) { } }
/* Ask the diagram editor for the picture of a diagram without opening it (its de:render message). Gives the answer, or null. */
function deRender(xml, title) {
  return new Promise(res => {
    const id = 'r' + (++DE.seq), msg = { type: 'de:render', xml, title, id }, o = $('#de-overlay'); DE.jobs.set(id, v => { deQuiet(); res(v); });
    if (o.hidden) { o.classList.add('de-quiet'); o.hidden = false; }   // the diagram editor measures text, so it must be laid out, but it is not shown
    deFrame();
    if (DE.ready) DE.frame.contentWindow.postMessage(msg, '*'); else DE.queue.push(msg);
    setTimeout(() => { const j = DE.jobs.get(id); if (j) { DE.jobs.delete(id); j(null); } }, 20000);
  });
}
function deQuiet() { const o = $('#de-overlay'); if (!DE.jobs.size && o.classList.contains('de-quiet')) { o.classList.remove('de-quiet'); if (!DE.open) o.hidden = true; } }
function closeDiagram() { DE.open = false; DE.kind = null; DE.target = null; $('#de-overlay').hidden = true; $('#dm-overlay').hidden = true; document.documentElement.classList.remove('de-open'); restore(); }
function dgApply(m) {
  if (typeof m.svg !== 'string' || !/^\s*<svg[\s>]/i.test(m.svg)) { alert('The diagram editor returned no picture; the document was not changed.'); return; }
  const tmp = document.createElement('div'); tmp.innerHTML = m.svg; const svg = tmp.querySelector('svg'); if (!svg) return;
  sanitize(tmp); cardify(tmp);
  let fig = DE.target && doc.contains(DE.target) ? DE.target : null;
  if (fig && fig.classList.contains('dg') && typeof m.xml === 'string' && m.xml === fig.getAttribute('data-drawio')) return;   // Done with nothing changed: the page is not changed either
  if (fig && !fig.classList.contains('dg')) { clearTimeout(timer); histSnap(); const n = document.createElement('div'); n.className = 'dg'; fig.replaceWith(n); fig = n; mmSel = null; } // a page diagram, picture or Mermaid definition, now converted
  if (!fig) {
    fig = document.createElement('div'); fig.className = 'dg';
    placeBlock(fig);
    const cap = el('<p class="cap">Figure. Caption</p>'); fig.after(cap);
  }
  fig.setAttribute('contenteditable', 'false'); fig.setAttribute('title', 'Double-click to edit');
  fig.setAttribute('data-drawio', typeof m.xml === 'string' ? m.xml : '');
  fig.replaceChildren(svg);
  touch(); fig.scrollIntoView({ block: 'nearest' });
}
window.addEventListener('message', e => {
  if (!DE.frame || e.source !== DE.frame.contentWindow) return;
  const m = e.data; if (!m || typeof m !== 'object') return;
  if (m.type === 'de:ready') { DE.ready = true; DE.queue.splice(0).forEach(q => DE.frame.contentWindow.postMessage(q, '*')); if (DE.pending) { DE.frame.contentWindow.postMessage(DE.pending, '*'); DE.pending = null; } if (DE.open) deFocus(); }
  else if (m.type === 'de:rendered') { const j = DE.jobs.get(m.id); if (j) { DE.jobs.delete(m.id); j(m.error ? null : m); } }
  else if (m.type === 'de:save' && DE.open) { dgApply(m); closeDiagram(); }
  else if (m.type === 'de:cancel' && DE.open) closeDiagram();
});
/* ---------- data models: the built-in Data Model Studio ----------
   A data model is stored as <div class="dg dm" data-dms="Data Model Studio file (.dms.json)">inline SVG</div>, so it is
   selected, copied, captioned and deleted like a diagram. Editing opens Data Model Studio (vendor/data-model-studio.html,
   base64 in #dm-src) in its own overlay and talks to it with its embed messages: dm:ready, dm:init, dm:save, dm:cancel, dm:dirty.
   It shares DE.open and DE.target with the diagram editor, so everything that keeps the page still while an editor is open applies. */
const DM = { frame: null, ready: false, pending: null, src: null };
function dmSource() {
  if (DM.src) return DM.src;
  const bin = atob($('#dm-src').textContent.trim()), u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return (DM.src = new TextDecoder().decode(u));
}
function dmFrame() { if (DM.frame) return DM.frame; DM.frame = $('#dm-frame'); DM.frame.srcdoc = dmSource(); return DM.frame; }
function dmFocus() { const a = document.activeElement; if (a && a !== document.body && a.blur) a.blur(); getSelection().removeAllRanges(); try { DM.frame.focus(); DM.frame.contentWindow.focus(); } catch (e) { } }
function openDataModel(fig) {
  if (DE.open) return;
  deactivate(); dgSelect(null);
  DE.target = fig || null; DE.open = true; DE.kind = 'dm';
  const msg = { type: 'dm:init', model: fig ? (fig.getAttribute('data-dms') || '') : '', title: fig ? dgTitle(fig) : 'Data model', theme: 'blueprint', appTheme: appTheme() };
  $('#dm-overlay').hidden = false; document.documentElement.classList.add('de-open');
  dmFrame(); dmFocus();
  if (DM.ready) DM.frame.contentWindow.postMessage(msg, '*'); else DM.pending = msg;
}
function dmApply(m) {
  if (typeof m.svg !== 'string' || !/^\s*<svg[\s>]/i.test(m.svg) || typeof m.model !== 'string' || !m.model) { alert('Data Model Studio returned no picture (an empty model has nothing to show); the document was not changed.'); return; }
  const tmp = document.createElement('div'); tmp.innerHTML = m.svg; const svg = tmp.querySelector('svg'); if (!svg) return;
  sanitize(tmp); cardify(tmp);
  let fig = DE.target && doc.contains(DE.target) ? DE.target : null;
  if (fig && m.model === fig.getAttribute('data-dms')) return;   // Done with nothing changed: the page is not changed either
  if (!fig) {
    fig = document.createElement('div'); fig.className = 'dg dm';
    placeBlock(fig);
    const cap = el('<p class="cap">Figure. Caption</p>'); fig.after(cap);
  }
  fig.setAttribute('contenteditable', 'false'); fig.setAttribute('title', 'Double-click to edit');
  fig.setAttribute('data-dms', m.model);
  fig.replaceChildren(svg);
  touch(); fig.scrollIntoView({ block: 'nearest' });
}
window.addEventListener('message', e => {
  if (!DM.frame || e.source !== DM.frame.contentWindow) return;
  const m = e.data; if (!m || typeof m !== 'object') return;
  if (m.type === 'dm:ready') { DM.ready = true; if (DM.pending) { DM.frame.contentWindow.postMessage(DM.pending, '*'); DM.pending = null; } if (DE.open && DE.kind === 'dm') dmFocus(); }
  else if (m.type === 'dm:save' && DE.open && DE.kind === 'dm') { dmApply(m); closeDiagram(); }
  else if (m.type === 'dm:cancel' && DE.open && DE.kind === 'dm') closeDiagram();
});
function dgSelect(f) { $$('.ed-dsel', doc).forEach(n => n.classList.remove('ed-dsel')); dgSel = f; if (f) { f.classList.add('ed-dsel'); const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) s.removeAllRanges(); } gbarUI(); }
/* The bar under the toolbar: for a selected diagram, Edit and Delete; for a selected picture from elsewhere, or with the
   cursor in a Mermaid definition, the offer to make it a diagram. */
function gbarUI() {
  const f = dgSel, pic = !!f && !f.matches('.dg, .fig'), mm = !f && mmSel && doc.contains(mmSel) ? mmSel : null, bar = $('#gbar'), was = bar.hidden;
  const dmf = !!f && f.classList.contains('dm');
  bar.hidden = !(f || mm); $('b', bar).textContent = pic ? 'Picture' : mm ? 'Mermaid definition' : dmf ? 'Data model' : 'Diagram'; $('[data-a="dgedit"]').textContent = dmf ? 'Edit data model' : 'Edit diagram';
  $('[data-a="dgedit"]').hidden = !f || pic; $('[data-a="dgconv"]').hidden = !(pic || mm); $('[data-a="dgdel"]').hidden = !f; $('[data-a="dgcopy"]').hidden = !f; $('[data-a="dgcut"]').hidden = !f; if (!f) $('#gbar .dgsaid').textContent = ''; $('[data-a="dgdel"]').textContent = pic ? 'Delete picture' : dmf ? 'Delete data model' : 'Delete diagram';
  if (was !== bar.hidden) chromeHeight();
}
function mmUI(n) { const b = dgSel ? null : mmBlock(n); if (b !== mmSel) { mmSel = b; gbarUI(); } }
/* A selected diagram or picture is copied with Ctrl+C (or cut with Ctrl+X) wherever the keyboard focus is: the keys ask
   the browser to copy, and the copy writes the diagram. It used to be copied only when the cursor had been in the page
   before the diagram was clicked, which is why it seemed to depend on where the pointer was. */
let dgCopyNow = false;
function dgToClip(cd) { const box = document.createElement('div'); box.appendChild(dgSel.cloneNode(true)); $$('.ed-dsel', box).forEach(n => n.classList.remove('ed-dsel')); clipClean(box); box.setAttribute('data-fle-clip', '1'); cd.setData('text/html', box.outerHTML); cd.setData('text/plain', dgTitle(dgSel) || 'Diagram'); }
function dgCopy(cut) {
  if (!dgSel) return; dgCopyNow = true; let ok;
  try { ok = document.execCommand(cut ? 'cut' : 'copy'); } catch (e) { ok = false; }
  if (dgCopyNow) {   // no copy event came: write it with the asynchronous clipboard
    dgCopyNow = false; const box = document.createElement('div'); box.appendChild(dgSel.cloneNode(true)); $$('.ed-dsel', box).forEach(n => n.classList.remove('ed-dsel')); clipClean(box); box.setAttribute('data-fle-clip', '1');
    const html = box.outerHTML, text = dgTitle(dgSel) || 'Diagram';
    try { navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]).then(() => { if (cut) dgCut(); dgSaid(cut); }, () => alert('The browser did not let the editor copy the diagram.')); } catch (e) { alert('The browser did not let the editor copy the diagram.'); }
    return;
  }
  if (ok) dgSaid(cut);
}
function dgSaid(cut) { const m = $('#gbar .dgsaid'); if (m) { m.textContent = cut ? 'Cut: click where it goes, then Ctrl+V' : 'Copied: click where it goes, then Ctrl+V'; clearTimeout(m._t); m._t = setTimeout(() => { m.textContent = ''; }, 4000); } }
// Cut: the diagram goes, with its default caption, as one undo step; the cursor is left where it was.
function dgCut() { const f = dgSel; if (!f) return; clearTimeout(timer); histSnap(); dgSelect(null); const cap = f.nextElementSibling; const at = f.previousElementSibling || cap; f.remove(); if (cap && cap.classList.contains('cap') && /^Figure\.\s*Caption$/.test(cap.textContent.trim())) cap.remove(); if (at && doc.contains(at)) caret(at, true); touch(); }
function dgDelete() { if (!dgSel || !confirm(dgSel.matches('.dg, .fig') ? 'Delete this diagram?' : 'Delete this picture?')) return; const f = dgSel; dgSelect(null); const cap = f.nextElementSibling; f.remove(); if (cap && cap.classList.contains('cap') && /^Figure\.\s*Caption$/.test(cap.textContent.trim())) cap.remove(); touch(); }

/* ---------- show blocks ----------
   A view for pages from elsewhere. Their layout containers (div and the like) come in without the style sheet that set
   them out, so what was in columns or cards can sit oddly in the one column the editor has. Show blocks outlines every
   block and labels each container with its tag and class. With it on, the bar under the toolbar works on the container
   the cursor is in, or the one clicked: Unwrap keeps what is in it and takes the container away, Delete takes both, and
   Delete empty containers clears every container that has nothing in it. The view is not part of the document: it is
   not saved, and the mark on the chosen container (data-ed-ct) is taken out of saves, copies and the history. */
const CT_TAGS = 'div,section,article,aside,header,footer,main,figure,figcaption,blockquote,address,center,details,summary,fieldset,hgroup';
const CT_OWN = '.dg,.fig,.box,.note,.note-body,.note-log,.note-entries,.tw,.ed-handle';   // the editor's own blocks are not containers
let showBlocks = false, ctSel = null;
function isCt(e) { return !!e && e.nodeType === 1 && e !== doc && doc.contains(e) && e.matches(CT_TAGS) && !e.matches(CT_OWN) && !e.closest('.dg,.fig,svg,.note-log'); }
function ctAt(n) { if (n && n.nodeType !== 1) n = n.parentElement; while (n && n !== doc && !isCt(n)) n = n.parentElement; return n && n !== doc ? n : null; }
function ctEmpties() { const all = $$(CT_TAGS, doc).filter(c => isCt(c) && !hasContent(c)); return all.filter(c => !all.includes(ctAt(c.parentNode))); }   // the outermost of each nest
function ctName(c) { const k = (c.getAttribute('class') || '').trim().split(/\s+/).filter(Boolean); return c.tagName.toLowerCase() + (k.length ? '.' + k.join('.') : ''); }
function ctSelect(c) { $$('[data-ed-ct]', doc).forEach(n => { if (n !== c) n.removeAttribute('data-ed-ct'); }); ctSel = c && showBlocks && isCt(c) ? c : null; if (ctSel && !ctSel.hasAttribute('data-ed-ct')) ctSel.setAttribute('data-ed-ct', ''); ctUI(); }
function ctUI() {
  const bar = $('#cbar'), was = bar.hidden; bar.hidden = !showBlocks;
  if (showBlocks) {
    const n = ctEmpties().length, total = $$(CT_TAGS, doc).filter(isCt).length;
    $('#ctname').textContent = ctSel ? ctName(ctSel) + (hasContent(ctSel) ? '' : ' (empty)') : total ? 'Click in a container to choose it. ' + total + ' in this document.' : 'No containers in this document.';
    $('[data-a="ctunwrap"]').disabled = !ctSel; $('[data-a="ctdel"]').disabled = !ctSel;
    const e = $('[data-a="ctempty"]'); e.disabled = !n; e.textContent = 'Delete empty containers (' + n + ')';
  }
  if (was !== bar.hidden) chromeHeight();
}
function blocksSet(on) {
  showBlocks = !!on; doc.classList.toggle('ed-blocks', showBlocks); const b = $('[data-a="blocks"]'); b.classList.toggle('on', showBlocks); b.setAttribute('aria-pressed', String(showBlocks));
  ctSelect(showBlocks && lastRange && doc.contains(lastRange.startContainer) ? ctAt(lastRange.startContainer) : null);
}
function caretIn(n) { if (!n || !doc.contains(n)) return; const r = document.createRange(); r.selectNodeContents(n); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); }
/* Unwrap: what is in the container takes its place. Blocks stay as they are; loose words and other inline content
   become paragraphs, so nothing is left as bare text in the page. Inside a table cell or a list item, which hold lines
   and not paragraphs, the content stays inline and a line break keeps it apart from what follows. */
function ctUnwrap(c) {
  if (!isCt(c)) return; const par = c.parentNode, blocky = par === doc || isCt(par) || holds(par), isBlk = n => n.nodeType === 1 && n.matches(BLOCKS + ',' + CT_TAGS + ',hr');
  const kids = [...c.childNodes].filter(n => n.nodeType !== 8), out = []; let run = null;
  if (blocky) { for (const k of kids) { if (isBlk(k)) { run = null; out.push(k); } else if (!run && k.nodeType === 3 && !k.data.trim()) continue; else { if (!run) { run = document.createElement('p'); out.push(run); } run.appendChild(k); } } }
  else { out.push(...kids); const last = kids[kids.length - 1], nx = c.nextSibling; if (hasContent(c) && nx && !(last && isBlk(last)) && !(nx.nodeType === 1 && isBlk(nx)) && nx.nodeName !== 'BR') out.push(document.createElement('br')); }
  const keep = out.filter(n => !(n.nodeName === 'P' && !n.attributes.length && !hasContent(n) && blocky && !kids.includes(n)));
  c.replaceWith(...keep); if (!doc.firstChild) doc.innerHTML = '<p><br></p>';
  const at = keep.find(n => n.nodeType === 1 || (n.nodeType === 3 && n.data.trim())) || par; caretIn(doc.contains(at) ? at : doc.firstChild);
  ctSelect(ctAt(doc.contains(at) ? at : par)); touch(); styleUI();
}
function ctDelete(c) {
  if (!isCt(c) || (hasContent(c) && !confirm('Delete this container and everything in it?'))) return;
  const nx = c.nextElementSibling || c.previousElementSibling || c.parentNode; c.remove(); if (!doc.firstChild) doc.innerHTML = '<p><br></p>';
  const at = doc.contains(nx) && nx !== doc ? nx : doc.firstChild; caretIn(at); ctSelect(ctAt(at)); touch(); styleUI();
}
function ctDeleteEmpties() { const e = ctEmpties(); if (!e.length) return; e.forEach(c => c.remove()); if (!doc.firstChild) doc.innerHTML = '<p><br></p>'; if (!lastRange || !doc.contains(lastRange.startContainer)) caretIn(doc.firstChild); ctSelect(lastRange ? ctAt(lastRange.startContainer) : null); touch(); styleUI(); }
doc.addEventListener('click', e => { if (showBlocks && !board) { const c = ctAt(e.target); if (c !== ctSel) ctSelect(c); } });

/*CONVERT*/
/* ---------- load and save ---------- */
function clean() {
  const c = doc.cloneNode(true);
  $$('.ed-handle', c).forEach(n => n.remove());
  $$('.ed-sel,.ed-selc,.ed-active,.ed-from,.ed-connect,.ed-cell', c).forEach(n => n.classList.remove('ed-sel', 'ed-selc', 'ed-active', 'ed-from', 'ed-connect', 'ed-cell'));
  $$('[contenteditable]', c).forEach(n => n.removeAttribute('contenteditable'));
  $$('[data-ed-ct]', c).forEach(n => n.removeAttribute('data-ed-ct'));
  $$('.fig', c).forEach(f => { f.style.height = ''; f.style.maxWidth = ''; if (f.firstElementChild) f.firstElementChild.style.transform = ''; if (!f.getAttribute('style')) f.removeAttribute('style'); });
  $$('.dg, .fig', c).forEach(n => { n.classList.remove('ed-dsel'); n.removeAttribute('title'); });
  $$('.note-log[open]', c).forEach(d => d.removeAttribute('open'));
  $$('a[data-ed-title]', c).forEach(a => { a.removeAttribute('title'); a.removeAttribute('data-ed-title'); });
  $$('.ed-fhide', c).forEach(n => { n.classList.remove('ed-fhide'); n.removeAttribute('hidden'); }); $$('.ed-folded', c).forEach(n => n.classList.remove('ed-folded'));
  $$('[class=""]', c).forEach(n => n.removeAttribute('class'));
  // HTML drops a line break straight after <pre> when the page is read, so a code block that starts with an empty line gets one more
  $$('pre', c).forEach(p => { const f = p.firstChild; if (f && f.nodeType === 3 && f.data.startsWith('\n')) f.data = '\n' + f.data; });
  return c;
}
/* A saved page holds only plain ASCII bytes: every other character is written as its HTML code (&mdash;, &rarr;, &#9472;).
   Browsers and this editor show the same page, and a program that reads the file with the wrong encoding cannot garble it.
   Common characters get their name, so the code still reads sensibly if something shows it as text; the rest get their number. */
const CHAR_NAMES = { 160: 'nbsp', 169: 'copy', 174: 'reg', 176: 'deg', 177: 'plusmn', 183: 'middot', 215: 'times', 247: 'divide', 163: 'pound', 8364: 'euro', 8482: 'trade',
  8211: 'ndash', 8212: 'mdash', 8216: 'lsquo', 8217: 'rsquo', 8220: 'ldquo', 8221: 'rdquo', 8226: 'bull', 8230: 'hellip',
  8592: 'larr', 8593: 'uarr', 8594: 'rarr', 8595: 'darr', 8596: 'harr', 8656: 'lArr', 8658: 'rArr', 8660: 'hArr', 8800: 'ne', 8804: 'le', 8805: 'ge', 8776: 'asymp',
  224: 'agrave', 225: 'aacute', 226: 'acirc', 228: 'auml', 231: 'ccedil', 232: 'egrave', 233: 'eacute', 234: 'ecirc', 235: 'euml', 237: 'iacute', 239: 'iuml', 241: 'ntilde', 243: 'oacute', 244: 'ocirc', 246: 'ouml', 250: 'uacute', 252: 'uuml',
  192: 'Agrave', 193: 'Aacute', 196: 'Auml', 199: 'Ccedil', 201: 'Eacute', 209: 'Ntilde', 214: 'Ouml', 220: 'Uuml', 223: 'szlig' };
const asciiHtml = t => t.replace(/[^\x00-\x7F]/gu, ch => { const n = ch.codePointAt(0); return '&' + (CHAR_NAMES[n] || '#' + n) + ';'; });
/* Fonts in a saved page. The body font and the heading font always go in. The italic font and the code font are two fifths
   of a page's size, so each goes in only when something on the page is drawn with it: the page looks the same either way,
   and the font comes back at the next save once the page uses it. What is used is read from how the browser has drawn the
   page, so it covers text styled by the style sheet, by a tag, or by a diagram's own attributes. */
const FONT_ITALIC = /@font-face \{ font-family: 'Instrument Sans'; font-style: italic;[^\n]*\n/, FONT_MONO = /@font-face \{ font-family: 'JetBrains Mono';[^\n]*\n/;
let fontPseudo = null;   // style-sheet rules that draw text of their own before or after an element: [selector, '::before' or '::after']
function fontsUsed() {
  const use = { italic: false, mono: false }, see = cs => { if (/italic|oblique/.test(cs.fontStyle)) use.italic = true; if (/JetBrains Mono/.test(cs.fontFamily)) use.mono = true; };
  for (const e of $$('*', doc)) { if (use.italic && use.mono) return use; for (let n = e.firstChild; n; n = n.nextSibling) if (n.nodeType === 3 && n.data.trim()) { see(getComputedStyle(e)); break; } }
  if (!fontPseudo) { fontPseudo = []; try { for (const r of $('#doc-css').sheet.cssRules) if (r.selectorText) r.selectorText.split(',').forEach(x => { const m = x.match(/::?(before|after)\s*$/); if (m) fontPseudo.push([x.slice(0, m.index).trim() || '*', '::' + m[1]]); }); } catch (e) { } }
  for (const [sel, ps] of fontPseudo) { if (use.italic && use.mono) break; let e = null; try { e = doc.querySelector(sel); } catch (x) { } if (e) { const cs = getComputedStyle(e, ps); if (cs.content && cs.content !== 'none' && cs.content !== 'normal') see(cs); } }
  return use;
}
function docCss() { const u = fontsUsed(); return DOC_CSS.replace(FONT_ITALIC, m => u.italic ? m : '').replace(FONT_MONO, m => u.mono ? m : ''); }
/* The title of a saved page: its first heading; else the file's own name, once it has one; else Untitled and a number. */
let untitledN = 1;
function docTitle() {
  const h = $('h1', doc), t = h ? h.textContent.replace(/[\u200b\ufeff]/g, '').replace(/\s+/g, ' ').trim() : ''; if (t) return t;
  const f = (handle || fname !== 'document.html') ? fname.replace(/\.[^./\\]+$/, '').trim() : ''; if (f) return f;
  return 'Untitled ' + untitledN;
}
/* The language of the page, for screen readers, spelling and hyphenation: an opened page keeps its own; a new one takes the browser's. */
const LANG_OK = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8})*$/;
let docLang = LANG_OK.test(navigator.language || '') ? navigator.language : 'en';
function setLang(l) { docLang = LANG_OK.test(l || '') ? l : (LANG_OK.test(navigator.language || '') ? navigator.language : 'en'); doc.setAttribute('lang', docLang); }
/* Only in the saved page, for people reading it with assistive technology; they come off again when the page is opened,
   so they cannot go stale while it is edited: each checklist box is named by its item, a table that can scroll sideways
   can be reached and scrolled from the keyboard, and the empty corner of a table with header rows and columns is a plain cell. */
function saveOnly(c) {
  $$('ul.check > li > input[type=checkbox]', c).forEach(i => { const li = i.parentNode, k = li.cloneNode(true); $$('ul,ol,input', k).forEach(x => x.remove()); i.setAttribute('aria-label', k.textContent.replace(/\s+/g, ' ').trim().slice(0, 200) || 'Checklist item'); });
  $$('div.tw', c).forEach(w => { if (w.closest('.fig,.dg')) return; const t = $('table', w); if (!t) return;
    let lab = ''; const cap = w.nextElementSibling && w.nextElementSibling.matches('p.cap') ? w.nextElementSibling : w.previousElementSibling && w.previousElementSibling.matches('p.cap') ? w.previousElementSibling : null;
    if (cap) lab = cap.textContent; else { const hs = $$('h1,h2,h3,h4', c).filter(h => h.compareDocumentPosition(w) & Node.DOCUMENT_POSITION_FOLLOWING && !h.closest('td,th,.fig,.dg')); if (hs.length) lab = hs[hs.length - 1].textContent; }   // its caption, or the heading it comes under
    w.setAttribute('role', 'region'); w.setAttribute('tabindex', '0'); w.setAttribute('aria-label', 'Table' + (lab.trim() ? ': ' + lab.replace(/\s+/g, ' ').trim().slice(0, 120) : '')); });
  $$('table', c).forEach(t => { const r0 = t.rows[0], x = r0 && r0.cells[0]; if (!x || x.tagName !== 'TH' || x.textContent.trim() || x.querySelector('img') || x.colSpan > 1 || x.rowSpan > 1 || r0.cells.length < 2 || t.rows.length < 2 || t.closest('.fig,.dg')) return;
    if (![...r0.cells].slice(1).every(k => k.tagName === 'TH') || ![...t.rows].slice(1).every(r => r.cells[0] && r.cells[0].tagName === 'TH')) return;
    const d = document.createElement('td'); [...x.attributes].filter(a => a.name !== 'scope').forEach(a => d.setAttribute(a.name, a.value)); d.append(...x.childNodes); x.replaceWith(d); });
}
/* What saveOnly() added, taken off when a page is opened (it is made again at each save). */
function unSave(m) {
  $$('ul.check > li > input[type=checkbox]', m).forEach(i => i.removeAttribute('aria-label'));
  $$('div.tw', m).forEach(w => { if (w.getAttribute('role') === 'region') w.removeAttribute('role'); w.removeAttribute('tabindex'); if (/^Table(: |$)/.test(w.getAttribute('aria-label') || '')) w.removeAttribute('aria-label'); });
  $$('table', m).forEach(t => { const r0 = t.rows[0], x = r0 && r0.cells[0]; if (!x || x.tagName !== 'TD' || x.textContent.trim() || x.querySelector('img') || x.colSpan > 1 || x.rowSpan > 1 || r0.cells.length < 2 || t.rows.length < 2) return;
    if (![...r0.cells].slice(1).every(k => k.tagName === 'TH') || ![...t.rows].slice(1).every(r => r.cells[0] && r.cells[0].tagName === 'TH')) return;
    const h = document.createElement('th'); [...x.attributes].forEach(a => h.setAttribute(a.name, a.value)); h.setAttribute('scope', 'col'); h.append(...x.childNodes); x.replaceWith(h); });   // a cell of the header row, as the editor makes it
}
function build(opts) {
  tidyNotes(false); rebuild(); const c = clean(), h1 = $('h1', c);
  if (opts && opts.noNotes) $$('.note', c).forEach(unwrapNote);
  $$('a[href]', c).forEach(a => { if (/^\s*https?:/i.test(a.getAttribute('href'))) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); } });
  const nav = indexHtml(c, idxDepth);
  saveOnly(c);
  /* The saved page loads nothing and runs nothing: pictures and fonts are inside it, and a policy says so, so content
     that got past the clean-up still could not run or reach the web. */
  const csp = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'";
  return '<!DOCTYPE html>\n<html lang="' + esc(docLang) + '">\n<head>\n<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="' + csp + '">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="generator" content="fine-line-editor ' + VERSION + '">\n<title>' + asciiHtml(esc(docTitle())) + '</title>\n<style>' + docCss() + '</style>\n</head>\n<body>\n<div class="page">\n<nav aria-label="Index" data-depth="' + idxDepth + '"><b>Index</b><ol>' + asciiHtml(nav) + '</ol></nav>\n<main' + (showNotes && !(opts && opts.noNotes) ? ' class="notes-on"' : '') + '>\n' + asciiHtml(c.innerHTML) + '\n</main>\n</div>\n</body>\n</html>\n';
}
function prepView() { dgSel = null; ctSelect(null); $('#gbar').hidden = true; $$('.dg, .fig', doc).forEach(f => f.classList.remove('ed-dsel')); fit(); chromeHeight(); }
function prep() {
  inspectClose(); cellSel = null; doc.classList.remove('ed-cells'); $$('.ed-cell', doc).forEach(x => x.classList.remove('ed-cell'));
  checkFix(doc); migrateGrids(doc); cellMarks();
  dgSelect(null); ctSelect(null); $$('.dg, .fig', doc).forEach(f => { f.setAttribute('contenteditable', 'false'); f.setAttribute('title', 'Double-click to edit'); });
  $$('.wb-board', doc).forEach(b => { if (!b.parentNode.classList.contains('fig')) { const f = el('<div class="fig"></div>'); b.replaceWith(f); f.appendChild(b); } });
  $$('.fig', doc).forEach(f => f.setAttribute('contenteditable', 'false'));
  $$('.wb-board > *', doc).forEach(e => { if (!e.id && !e.dataset.conn) e.id = uid(); });
  $$('.wb-box, .wb-layer', doc).forEach(b => { if (!$(':scope > span', b)) { const t = document.createElement('span'); [...b.childNodes].filter(n => !(n.nodeType === 1 && isSvg(n))).forEach(n => t.appendChild(n)); b.appendChild(t); } });
  undo = []; rebuild(); fit();
}
function sanitize(root) {
  $$('script,iframe,object,embed,base,form,input,button,textarea,select,frame,frameset,applet,meta,link', root).forEach(n => { if (!n.matches('ul.check > li > input[type=checkbox]')) n.remove(); }); // a checklist's own boxes stay
  $$('*', root).forEach(n => [...n.attributes].forEach(a => {
    const k = a.name.toLowerCase(), v = a.value.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
    if (k.startsWith('on') || k === 'srcdoc' || k === 'formaction' || (/^(href|src|xlink:href|action|data|poster|background)$/.test(k) && (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:text/html')))) n.removeAttribute(a.name);
  }));
  $$('animate,set,animateMotion,animateTransform', root).filter(n => /^(href|xlink:href)$/i.test(n.getAttribute('attributeName') || '')).forEach(n => n.remove());
  // what is left of content that was taken out: a reference to a drawing elsewhere, and pictures or formulas with nothing in them
  $$('use', root).filter(u => { const h = u.getAttribute('href') || u.getAttribute('xlink:href') || ''; return !h.startsWith('#'); }).forEach(n => n.remove());
  $$('math', root).filter(m => !m.textContent.trim()).forEach(n => n.remove());
  $$('svg', root).filter(s => !s.querySelector('*') && !s.textContent.trim() && !s.closest('.fig,.dg')).forEach(n => n.remove());
}
/* Nothing in a document is downloaded when it opens, in the editor or in the saved file. Images, video and audio
   that point to the web become link cards (still links, so they work outside the editor); web addresses in styles are
   dropped. Links themselves are never fetched until clicked, so they stay as they are. */
const isWeb = v => !!v && !/^\s*(data:|blob:|#|$)/i.test(v);
function shortUrl(u) { try { const x = new URL(u, 'https://x.invalid/'); const f = x.pathname.split('/').filter(Boolean).pop() || ''; return (x.host === 'x.invalid' ? '' : x.host) + (f ? ' \u203a ' + decodeURIComponent(f) : ''); } catch (e) { return u.slice(0, 60); } }
function card(kind, url, label) { const a = document.createElement('a'); a.className = 'link-card'; a.dataset.kind = kind.toLowerCase(); a.href = url; a.innerHTML = '<b></b><span></span>'; a.firstChild.textContent = label || kind; a.lastChild.textContent = shortUrl(url); return a; }
function cardify(root) {
  let n = 0; const first = v => (v || '').trim().split(/[\s,]+/)[0];
  $$('img', root).forEach(i => { const u = i.getAttribute('src') || first(i.getAttribute('srcset')); if (!isWeb(u) && !isWeb(first(i.getAttribute('srcset')))) return; const p = i.closest('picture'); (p || i).replaceWith(card('Image', isWeb(u) ? u : first(i.getAttribute('srcset')), i.getAttribute('alt'))); n++; });
  $$('picture source', root).forEach(x => x.remove());
  $$('video, audio', root).forEach(m => { const srcs = [m.getAttribute('src'), ...$$('source', m).map(x => x.getAttribute('src'))].filter(isWeb); if (!srcs.length && !isWeb(m.getAttribute('poster'))) return; m.replaceWith(card(m.tagName === 'VIDEO' ? 'Video' : 'Audio', srcs[0] || m.getAttribute('poster'), m.getAttribute('title') || m.getAttribute('aria-label'))); n++; });
  $$('image, feImage, use', root).forEach(i => ['href', 'xlink:href'].forEach(k => { const v = i.getAttribute(k); if (isWeb(v) && !(i.tagName === 'use' && v.trim().startsWith('#'))) { i.removeAttribute(k); n++; } }));
  const noUrl = t => t.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(?:"(?!data:|#)[^"]*"|'(?!data:|#)[^']*'|(?!["']|data:|#)(?:[^()\s]|\([^)]*\))*)\s*\)/gi, 'none');
  const webUrl = v => /url\(\s*(?!["']?\s*(?:data:|#))/i.test(v);
  $$('[style]', root).forEach(e => { const v = e.getAttribute('style'); if (!/url\(|@import/i.test(v)) return; const s = e.style, drop = []; for (let i = 0; i < s.length; i++) if (webUrl(s.getPropertyValue(s[i]))) drop.push(s[i]); drop.forEach(p => s.removeProperty(p)); e.setAttribute('style', s.cssText);   /* what the browser could read, without what would load: a declaration it cannot read goes too */ if (!e.getAttribute('style')) e.removeAttribute('style'); if (e.getAttribute('style') !== v) n++; });   // the property that would load goes, read by the browser's own parser
  $$('style', root).forEach(e => { const v = e.textContent, w = noUrl(v); if (w !== v) { e.textContent = w; n++; } });
  return n;
}
function load(text, name, opt) {
  const d = new DOMParser().parseFromString(text, 'text/html'), m = d.querySelector('main') || d.body;
  const nv = d.querySelector('nav[data-depth]'); idxDepth = nv ? Math.min(3, Math.max(1, parseInt(nv.dataset.depth, 10) || 1)) : 1; setNotes(m.matches('main.notes-on'));
  $$('script,nav,link,meta', m).forEach(n => n.remove());
  $$('style,title', m).filter(n => !n.closest('svg')).forEach(n => n.remove());
  sanitize(m); unSave(m); remoteImgs = cardify(m); upgradeNotes(m); repSet(null); $('#cleanbar').hidden = true; $('#savedbar').hidden = true;
  $$('section', m).forEach(s => s.replaceWith(...s.childNodes));
  $$('h2', m).forEach(h => { const f = h.firstChild; if (f && f.nodeType === 3 && !(opt && opt.asTyped)) f.nodeValue = f.nodeValue.replace(/^\s*\d+\.\s+/, ''); h.removeAttribute('id'); });   // a page numbers its H2s itself; a Markdown file keeps a number that was typed
  setLang(d.documentElement.getAttribute('lang'));
  deactivate(); foldReset(); doc.innerHTML = preLF(m.innerHTML.trim()); prep(); histReset(); fname = name || fname; dirty = false; status(); scrollTo(0, 0);
  if (prepNote) { $('#savedmsg').textContent = prepNote; $('#savedmsg').removeAttribute('title'); $('#savedbar').hidden = false; prepNote = ''; chromeHeight(); }
}
function download(html) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const TYPES_HTML = [{ description: 'HTML document', accept: { 'text/html': ['.html', '.htm'] } }];
/* Open and Save dialogs share one name, so Chrome and Edge reopen them in the folder used last, across sessions.
   The browser keeps this in its own profile; nothing is written to the document or the project. While a document is
   open, the dialogs start in that document's folder. */
function pickerOpts(o) { o.id = 'fine-line-documents'; o.types = TYPES_HTML; if (handle) o.startIn = handle; delete o.noStart; return o; }
/* After a save, a line names the file. A page is told the file's name only, never its folder, so the name is all it can show. */
function savedLine(name, dl) { $('#savedmsg').title = 'The browser tells the editor the file name only, not the folder it was saved in'; $('#savedmsg').textContent = (dl ? 'File saved to the browser\'s downloads folder: ' : 'File saved: ') + name; $('#savedbar').hidden = false; chromeHeight(); }
function afterSave(dl) {
  dirty = false; status(); try { localStorage.removeItem(PRODUCT.key + '-draft'); } catch (e) { }
  savedLine(fname, dl);
  if (notesIn(doc)) { $('#cleanbar').hidden = false; chromeHeight(); }
}
/* In a notebook, New, Open and switching pages offer Save, Discard or Cancel; outside one they ask as before. */
async function gate(what) { return NB.on() ? NB.leave() : keepGoing(what); }
async function save(as) {
  if (NB.page() && (!as || NB.foreign())) return NB.savePage(as);   // a notebook page; or a Markdown or text file, which is saved as itself even by Save as
  let dl = false; deactivate(); let html = build();
  try {
    if (window.showSaveFilePicker) {
      if (!handle || as) {   // a document with no file yet is offered its title as a name; the saved title then follows the name chosen
        const sug = handle || fname !== 'document.html' ? fname : docTitle().replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|[. ]+$/g, '').slice(0, 120) + '.html';
        handle = await showSaveFilePicker(pickerOpts({ suggestedName: sug })); fname = handle.name; html = build();
      }
      const w = await handle.createWritable(); await w.write(html); await w.close(); fname = handle.name;
    } else { download(html); dl = true; }
  } catch (e) { if (e.name === 'AbortError') return; handle = null; download(html); dl = true; }
  if (as) NB.detach();
  afterSave(dl);
}
async function saveClean() {
  $('#cleanbar').hidden = true; chromeHeight();
  const html = build({ noNotes: true }), name = fname.replace(/\.html?$/i, '') + '-clean.html';
  try {
    if (window.showSaveFilePicker) { const h = await showSaveFilePicker(pickerOpts({ suggestedName: name, noStart: true })); const w = await h.createWritable(); await w.write(html); await w.close(); savedLine(h.name, false); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  const keep = fname; fname = name; download(html); fname = keep; savedLine(name, true);
}
async function open() {
  if (!(await gate('open another document'))) return;
  try {
    if (window.showOpenFilePicker) { const [h] = await showOpenFilePicker(pickerOpts({})); const f = await h.getFile(); handle = h; NB.detach(); load(await withPictures(await f.text()), f.name); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  $('#file').click();
}
$('#file').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; handle = null; NB.detach(); load(await withPictures(await f.text()), f.name); e.target.value = ''; });
async function fresh() { if (!(await gate('start a new document'))) return; untitledN++; blank(); NB.newPage(); }
function blank() { handle = null; fname = 'document.html'; idxDepth = 1; setLang(null); repSet(null); $('#cleanbar').hidden = true; $('#savedbar').hidden = true; setNotes(false); remoteImgs = 0; deactivate(); foldReset(); doc.innerHTML = STARTER; prep(); histReset(); dirty = false; status(); }

/* ---------- emoji ----------
   The Emoji button opens a small list under it; a click puts that emoji in where the cursor is, in place of any selected
   text. The list is src/emoji.default.json, built into both programs. A saved page holds each one as its HTML code,
   like every other character outside plain ASCII. */
const emojiBox = $('#emoji'), emojiBtn = $('[data-a="emoji"]');
function emojiShow(on) {
  if (on && !emojiBox.firstChild) EMOJI.forEach((e, i) => { const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.dataset.i = i; b.textContent = e.char; b.title = e.tooltip; b.setAttribute('aria-label', e.tooltip); emojiBox.appendChild(b); });
  emojiBox.hidden = !on; emojiBtn.classList.toggle('on', on); emojiBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) { const r = emojiBtn.getBoundingClientRect(); emojiBox.style.left = Math.max(8, Math.min(r.left, innerWidth - emojiBox.offsetWidth - 8)) + 'px'; emojiBox.style.top = (r.bottom + 4) + 'px'; }
}
function emojiInsert(ch) {
  restore(); const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
  if (blockOf(s.anchorNode)) codeInsert(ch); else document.execCommand('insertText', false, ch);
  live(); touch();
}
emojiBox.addEventListener('mousedown', e => e.preventDefault());
emojiBox.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const ch = EMOJI[+b.dataset.i].char; emojiShow(false); clearTimeout(timer); histSnap(); emojiInsert(ch); repSet('Emoji ' + ch, () => emojiInsert(ch)); });
document.addEventListener('mousedown', e => { if (!emojiBox.hidden && !e.target.closest('#emoji, [data-a="emoji"]')) emojiShow(false); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !emojiBox.hidden) { e.stopPropagation(); emojiShow(false); restore(); } }, true);
window.addEventListener('resize', () => { if (!emojiBox.hidden) emojiShow(false); });

/* ---------- table format ----------
   A bar under the toolbar, opened from the Table format button while the cursor is in a table. It covers nothing and
   stays open while the page is worked on, so several things can be set one after another; it closes with its button,
   Close or Escape, or when the cursor leaves the table.
   Cell colour is set on the cell the cursor is in, or on the cells selected with Shift+click, in any table. It is saved
   on the cell as style="background-color:#RRGGBB", with color:#FFFFFF added when white text reads better on that
   colour than the page's ink does. Links keep the browser's own blue.
   Spacing, padding, borders and corners are set for a whole table and saved as classes on it (gap-s, gap-m; pad-s,
   pad-l; noline; round). A fancy table keeps its own. Corners can only be round where cells stand apart, so Rounded
   turns Small spacing on and no spacing turns Rounded off. In a table with spacing, a cell with no text and no colour
   is marked (td.mt) and draws nothing, so a short row does not end in empty boxes. */
const TF = { gap: { '': 'None', s: 'Small', m: 'Medium' }, pad: { s: 'Small', '': 'Normal', l: 'Large' }, line: { '': 'Grid', none: 'None' }, corner: { '': 'Square', round: 'Rounded' } };
const TF_NAME = { gap: 'Spacing', pad: 'Padding', line: 'Borders', corner: 'Corners' };
const TF_CLASS = { gap: v => 'gap-' + v, pad: v => 'pad-' + v, line: () => 'noline', corner: () => 'round' };
const tfFancy = t => t.classList.contains('lop') || t.classList.contains('spine');
function tfGet(t, k) { return Object.keys(TF[k]).find(v => v && t.classList.contains(TF_CLASS[k](v))) || ''; }
function tfPut(t, k, v) { Object.keys(TF[k]).forEach(x => { if (x) t.classList.remove(TF_CLASS[k](x)); }); if (v) t.classList.add(TF_CLASS[k](v)); }
function tfSet(k, v) {
  live(); const c = cell(); if (!c) return; const t = c.closest('table'); if (tfFancy(t)) return;
  tfPut(t, k, v);
  if (k === 'corner' && v && !tfGet(t, 'gap')) tfPut(t, 'gap', 's');
  if (k === 'gap' && !v) tfPut(t, 'corner', '');
  if (!t.getAttribute('class')) t.removeAttribute('class');
  touch(); tfUI();
}
const HEX = /^#[0-9a-f]{6}$/i, CELL_BG = /(?:^|;)\s*background-color\s*:\s*(#[0-9a-f]{6})\s*(?:;|$)/i, PAGE_INK = '#1C2B3A';
function lum(hex) { const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
const whiteInk = hex => 1.05 / (lum(hex) + 0.05) > (lum(hex) + 0.05) / (lum(PAGE_INK) + 0.05);   // which reads better on this colour: white, or the page's ink
function cellBg(x) { const m = (x.getAttribute('style') || '').match(CELL_BG); return m ? m[1].toUpperCase() : ''; }
function cellBgPut(x, hex) {
  const rest = (x.getAttribute('style') || '').split(';').map(d => d.trim()).filter(d => d && !/^(background(-color)?|color)\s*:/i.test(d));
  if (hex) { rest.push('background-color:' + hex.toUpperCase()); if (whiteInk(hex)) rest.push('color:#FFFFFF'); }
  if (rest.length) x.setAttribute('style', rest.join(';')); else x.removeAttribute('style');
}
function cellTargets() { const info = cellSelInfo(); if (info) return info.cells; live(); const c = cell(); return c ? [c] : []; }
function setCellBg(hex) { const cs = cellTargets(); if (!cs.length) return false; cs.forEach(x => cellBgPut(x, hex)); touch(); tfUI(); return true; }
function cellMarks() {
  $$('td.mt', doc).forEach(x => { const t = x.closest('table'); if (!t.matches('.gap-s,.gap-m') || hasContent(x) || cellBg(x)) { x.classList.remove('mt'); if (!x.getAttribute('class')) x.removeAttribute('class'); } });
  $$('table.gap-s td:not(.mt), table.gap-m td:not(.mt)', doc).forEach(x => { if (!x.closest('.fig,.dg') && !hasContent(x) && !cellBg(x)) x.classList.add('mt'); });
}
function hslHex(h, s, l) { s /= 100; l /= 100; const k = n => (n + h / 30) % 12, q = s * Math.min(l, 1 - l), f = n => l - q * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))); return '#' + [f(0), f(8), f(4)].map(x => Math.round(x * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); }
const tfBox = $('#tfmt'), tfBtn = $('[data-a="tfmt"]'), TF_KEY = PRODUCT.key + '-cellcolours';
const tfSwatch = hex => { const b = document.createElement('button'); b.type = 'button'; b.className = 'tf-sw'; b.dataset.c = hex; b.style.background = hex; b.title = hex; b.setAttribute('aria-label', 'Cell colour ' + hex); return b; };
function tfRecent(add) {
  let a = []; try { a = JSON.parse(localStorage.getItem(TF_KEY) || '[]'); } catch (e) { } a = (Array.isArray(a) ? a : []).filter(x => HEX.test(x)).map(x => x.toUpperCase());
  if (add) { a = [add.toUpperCase(), ...a.filter(x => x !== add.toUpperCase())].slice(0, 13); try { localStorage.setItem(TF_KEY, JSON.stringify(a)); } catch (e) { } }
  const box = $('#tf-recent'); box.textContent = ''; a.forEach(x => box.appendChild(tfSwatch(x))); if (!a.length) box.textContent = 'None yet';
  return a;
}
function tfCustom(hex) { $('#tf-hex').value = hex; $('#tf-color').value = hex.toLowerCase(); $('#tf-err').textContent = ''; }
function tfUI() {
  if (tfBox.hidden) return; live(); const c = cell(); if (!c) return;
  const t = c.closest('table'), fancy = tfFancy(t), info = cellSelInfo(), cur = cellBg(info ? info.cells[0] : c);
  $('#tf-scope').textContent = info ? info.cells.length + ' selected cells' : 'The cell the cursor is in';
  $$('#tf-pal button, #tf-recent button').forEach(b => b.classList.toggle('on', b.dataset.c === cur));
  if (!tfBox.contains(document.activeElement)) tfCustom(cur || '#FFFFFF');
  $('#tf-fancy').hidden = !fancy;
  $$('#tfmt button[data-k]').forEach(b => { b.disabled = fancy; const on = !fancy && tfGet(t, b.dataset.k) === b.dataset.v; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); });
}
function tfShow(on) {
  if (on && !$('#tf-pal').firstChild) { const pal = $('#tf-pal'); [88, 76, 62, 46].forEach(l => { pal.appendChild(tfSwatch(hslHex(210, 25, l))); for (let i = 0; i < 12; i++) pal.appendChild(tfSwatch(hslHex(i * 30, 60, l))); }); }
  tfBox.hidden = !on; tfBtn.classList.toggle('on', on); tfBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
  if (on) { tfRecent(); tfUI(); } chromeHeight();
}
function tfSync(inTable) { if (tfBox.hidden) return; if (inTable) tfUI(); else tfShow(false); }   // from styleUI: follows the cursor, and closes when it leaves the table
function tfColour(hex) { clearTimeout(timer); histSnap(); if (!setCellBg(hex)) return; if (hex) tfRecent(hex); repSet(hex ? 'Cell colour ' + hex.toUpperCase() : 'Cell colour off', () => setCellBg(hex)); tfUI(); }
tfBox.addEventListener('mousedown', e => { if (!e.target.closest('input')) e.preventDefault(); });   // the cursor and the selected cells stay as they are
tfBox.addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return;
  if (b.dataset.c) { tfColour(b.dataset.c); return; }
  if (b.dataset.k) { const k = b.dataset.k, v = b.dataset.v; clearTimeout(timer); histSnap(); tfSet(k, v); repSet('Table ' + TF_NAME[k].toLowerCase() + ': ' + TF[k][v].toLowerCase(), () => tfSet(k, v)); return; }
  const a = b.dataset.tf;
  if (a === 'close') { tfShow(false); restore(); }
  if (a === 'clear') tfColour('');
  if (a === 'cancel') { const info = cellSelInfo(), c = info ? info.cells[0] : cell(); tfCustom((c && cellBg(c)) || '#FFFFFF'); restore(); }
  if (a === 'ok') { let v = $('#tf-hex').value.trim(); if (/^[0-9a-f]{6}$/i.test(v)) v = '#' + v; if (!HEX.test(v)) { $('#tf-err').textContent = 'A colour is # and six characters, 0 to 9 and A to F, such as #EAF1F8'; $('#tf-hex').focus(); return; } tfCustom(v.toUpperCase()); restore(); tfColour(v.toUpperCase()); }
});
$('#tf-color').addEventListener('input', e => { $('#tf-hex').value = e.target.value.toUpperCase(); $('#tf-err').textContent = ''; });
$('#tf-hex').addEventListener('input', e => { const v = e.target.value.trim(); $('#tf-err').textContent = ''; if (HEX.test(v)) $('#tf-color').value = v.toLowerCase(); });
$('#tf-hex').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#tfmt [data-tf="ok"]').click(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !tfBox.hidden && !(cellSel && doc.contains(e.target))) { e.stopPropagation(); tfShow(false); restore(); } }, true);   // with cells selected, Escape ends that selection first

/* ---------- toolbar wiring ---------- */
/* App theme: how the editor's own controls look (toolbar, bars, notebook panel, menus); the document keeps the Fine Line style.
   The same themes as the diagram editor and Data Model Studio, which open in the editor's theme. Material Design unless chosen;
   the choice is kept in this browser. */
const APP_THEMES = [['system', 'Follow system'], ['studio-light', 'Studio light'], ['studio-dark', 'Studio dark'], ['classic', 'Classic'], ['flat-minimal', 'Flat / Minimal'], ['material', 'Material Design'], ['neumorphism', 'Neumorphism'], ['midnight', 'Midnight'], ['high-contrast', 'High contrast'], ['blueprint', 'Blueprint (Fine Line)']];
const APP_THEME_KEY = 'fl-app-theme', DEFAULT_APP_THEME = 'material';
const appTheme = () => document.documentElement.dataset.appTheme || 'blueprint';
function applyAppTheme(id, keep) {
  if (!APP_THEMES.some(t => t[0] === id)) id = DEFAULT_APP_THEME;
  if (id === 'blueprint') delete document.documentElement.dataset.appTheme; else document.documentElement.dataset.appTheme = id;
  if (keep !== false) try { localStorage.setItem(APP_THEME_KEY, id); } catch (e) { }
}
function appThemeMenu(btn) {
  let pop = $('#apptheme-pop'); if (pop) { pop.remove(); return; }
  pop = document.createElement('div'); pop.id = 'apptheme-pop'; pop.setAttribute('role', 'menu');
  const h = document.createElement('div'); h.className = 'h'; h.textContent = 'App theme'; pop.appendChild(h);
  for (const [id, label] of APP_THEMES) {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitemradio'); b.setAttribute('aria-checked', String(appTheme() === id));
    b.innerHTML = '<span class="chk">' + (appTheme() === id ? '\u2713' : '') + '</span>' + esc(label);
    b.onclick = () => { applyAppTheme(id); pop.remove(); };
    pop.appendChild(b);
  }
  (btn.closest('dialog') || document.body).appendChild(pop);   // inside Help, which sits above the page
  const r = btn.getBoundingClientRect(); pop.style.top = (r.bottom + 4) + 'px'; pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.right - pop.offsetWidth)) + 'px';
  setTimeout(() => document.addEventListener('mousedown', function off(e) { if (!e.target.closest('#apptheme-pop, [data-a="apptheme"]')) { pop.remove(); document.removeEventListener('mousedown', off); } }), 0);
}
try { applyAppTheme(localStorage.getItem(APP_THEME_KEY) || DEFAULT_APP_THEME, false); } catch (e) { applyAppTheme(DEFAULT_APP_THEME, false); }
const ACT = {
  new: fresh, open: open, nbwarnx: () => NB.warnOff(), save: () => save(false), saveas: () => save(true),
  bold: () => plainWeight(() => cmd('bold')), italic: () => cmd('italic'), ul: () => { if (qaList('ul')) return; const l = listAt(); if (l && l.matches('ul.check')) { l.classList.remove('check'); if (!l.getAttribute('class')) l.removeAttribute('class'); touch(); } else { listCmd('insertUnorderedList'); touch(); } }, ol: () => { if (qaList('ol')) return; listCmd('insertOrderedList'); touch(); }, check: checkList, ldense: listDense, indent: () => { listShift(1); }, outdent: () => { listShift(-1); },
  undo: () => histGo(-1), redo: () => histGo(1),
  code: addCode, divider: addDivider, clear: clearFormat, paint: () => { if (paint) paintStop(); else paintPick(false); }, note: addNote, margin: toggleNotes, who: () => initials(true), thin: () => { thinUI(!$('#chrome').classList.contains('thin')); chromeHeight(); }, saveclean: saveClean, repeat: repeatLast, nosaved: () => { $('#savedbar').hidden = true; chromeHeight(); }, noclean: () => { $('#cleanbar').hidden = true; chromeHeight(); },
  blocks: () => blocksSet(!showBlocks), ctunwrap: () => ctUnwrap(ctSel), ctdel: () => ctDelete(ctSel), ctempty: ctDeleteEmpties,
  print: () => window.print(),
  inspect: inspect, emoji: () => emojiShow(emojiBox.hidden), tfmt: () => tfShow(tfBox.hidden), link: editLink, olstart: editStart, index: () => { idxDepth = idxDepth % 3 + 1; rebuild(); touch(); }, // steps 1, 2, 3 and back to 1
  tag: () => { // put in by hand: the browser's own insert drops the tag in a list item and adds styles to it elsewhere
    restore(); const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return; const none = !s.toString(), t = s.toString() || 'ID', r = s.getRangeAt(0), blk = x => (x.nodeType === 1 ? x : x.parentElement).closest(TEXT_BLOCK);
    { const sb = blk(r.startContainer); if (sb && blk(r.endContainer) !== sb) { r.setEnd(sb, sb.childNodes.length); s.removeAllRanges(); s.addRange(r); return ACT.tag(); } }   // an ID tag stays within one block
    if (blk(r.startContainer) !== blk(r.endContainer) || /[\r\n]/.test(t)) { document.execCommand('insertHTML', false, '<span class="id">' + esc(t) + '</span>&nbsp;'); touch(); return; }
    // a space after the tag to carry on typing outside it, but only where none follows: text after a selection keeps its spacing
    const tb = blk(r.endContainer), tq = document.createRange(); tq.setStart(r.endContainer, r.endOffset); if (tb) tq.setEnd(tb, tb.childNodes.length); const tail = tb ? tq.toString().replace(/\u200b/g, '') : '', spaced = none ? !/^[\s\u00a0]/.test(tail) : !tail;
    r.deleteContents(); const sp = document.createElement('span'), gap = document.createTextNode(spaced ? '\u00a0' : ''); sp.className = 'id'; sp.textContent = t; r.insertNode(gap); r.insertNode(sp);
    [sp.previousSibling, gap.nextSibling].forEach(x => { if (x && x.nodeName === 'BR' && x.parentNode.matches(TEXT_BLOCK) && (x === x.parentNode.lastChild || (x === x.parentNode.firstChild && gap === x.parentNode.lastChild))) x.remove(); }); // the break that held an empty line open is not needed now
    let after = null; if (!spaced) { const nx = gap.nextSibling; gap.remove(); if (nx && nx.nodeType === 3) after = nx; }
    tagExit = none || spaced ? null : sp;   // what is typed straight after it goes outside it
    const c = document.createRange(); if (none) c.selectNodeContents(sp.firstChild); else if (spaced) { c.setStart(gap, 1); c.collapse(true); } else if (after) { c.setStart(after, 0); c.collapse(true); } else { c.setStartAfter(sp); c.collapse(true); } // with nothing selected the placeholder is selected, ready to type over
    s.removeAllRanges(); s.addRange(c); lastRange = c.cloneRange(); touch();
  },
  table: addTable, stage: addStage, mr: () => tableOp('mr'), md: () => tableOp('md'), split: () => tableOp('split'), qa: addQa, 'r+': () => tableOp('r+'), ra: () => tableOp('ra'), cl: () => tableOp('cl'), 'r-': () => tableOp('r-'), 'c+': () => tableOp('c+'), 'c-': () => tableOp('c-'), dense: () => tableOp('dense'), hr: () => tableOp('hr'), sr: () => tableOp('sr'), hc: () => tableOp('hc'), sc: () => tableOp('sc'),
  diagram: () => openDiagram(null), datamodel: () => openDataModel(null), dgedit: () => dgSel && openDiagram(dgSel), dgcopy: () => dgCopy(false), dgcut: () => dgCopy(true), dgconv: () => { const t = dgSel || mmSel; if (t) openDiagram(t); }, dgdel: dgDelete, help: () => { const h = $('#help'); if (h.open) h.close(); else { helpInfo(); h.showModal(); } },
  connect: () => setMode(mode === 'connect' ? null : 'connect'), del: remove, dup: duplicate, deldiagram: deleteDiagram,
  restore: () => { try { const d = localStorage.getItem(PRODUCT.key + '-draft'); if (d) { const t = new DOMParser().parseFromString('<main>' + d + '</main>', 'text/html'); sanitize(t.querySelector('main')); cardify(t.querySelector('main')); doc.innerHTML = t.querySelector('main').innerHTML; prep(); histReset(); dirty = true; status(); } } catch (e) { } $('#draft').hidden = true; chromeHeight(); },
  dismiss: () => { try { localStorage.removeItem(PRODUCT.key + '-draft'); } catch (e) { } $('#draft').hidden = true; chromeHeight(); },
};
$('#chrome').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
$('#chrome').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a; if (!board && ((CODE_OFF.includes(a) && selCode()) || (MD_CELL_OFF.includes(a) && mdCellSel()))) { restore(); return; } if (!board && !['undo', 'redo', 'help', 'inspect', 'new', 'open', 'save', 'saveas', 'who', 'saveclean', 'noclean', 'nosaved', 'margin', 'paint', 'repeat', 'nbwarnx', 'emoji', 'tfmt', 'blocks', 'print'].includes(a)) { clearTimeout(timer); histSnap(); } if (cellSel && (a === 'bold' || a === 'italic' || a === 'clear')) cellFormat(a); else if (ACT[a]) { ACT[a](); if (!board) repNote(a); } else if (ADD[a] && board) ADD[a](); });
$('#help').addEventListener('click', e => { const t = e.target.closest('[data-a="apptheme"]'); if (t) { appThemeMenu(t); return; } if (e.target === e.currentTarget || e.target.closest('[data-a="helpclose"]')) e.currentTarget.close(); });
$('#s-block').addEventListener('change', e => { const v = e.target.value; if (v) { const label = e.target.selectedOptions[0].textContent; clearTimeout(timer); histSnap(); setBlock(v); repSet(label, () => setBlock(v)); } styleUI(); });
$('#s-fmt').addEventListener('change', e => { const v = e.target.value; e.target.value = ''; if (selCode()) { restore(); styleUI(); return; } if (v && FMT[v]) { clearTimeout(timer); histSnap(); restore(); const want = !fmtOn(v); setFmt(v, want); repSet(FMT[v][0] + (want ? '' : ' off'), () => setFmt(v, want)); } styleUI(); });
$('#s-boxtype').addEventListener('change', e => { const v = e.target.value; if (v) { clearTimeout(timer); histSnap(); setBox(v); repSet(v === 'none' ? 'Remove box' : v === 'icon' ? 'Box icon on or off' : BOXES[v] + ' box', () => setBox(v)); } styleUI(); });
/* The cursor stays in the document: once a toolbar list has been opened and closes, with or without a choice, focus goes
   back to the text, so the arrow keys move the cursor and do not change the list. A list reached with Tab and never
   opened keeps the focus, so it can still be worked from the keyboard. */
$$('#tbar select').forEach(sel => {
  let watch = null, opened = false;
  const isOpen = () => { try { return sel.matches(':open'); } catch (e) { return null; } };
  sel.addEventListener('focus', () => {
    opened = false; clearInterval(watch);
    watch = setInterval(() => { const o = isOpen(); if (o === null) { clearInterval(watch); return; } if (o) opened = true; else if (opened && document.activeElement === sel) { clearInterval(watch); restore(); } }, 80);
  });
  sel.addEventListener('blur', () => clearInterval(watch));
});
$('#s-add').addEventListener('change', e => { if (e.target.value && board) ADD[e.target.value](); e.target.value = ''; });
$('#s-box').addEventListener('change', e => setBoxStyle(e.target.value));
$('#s-state').addEventListener('change', e => setState(e.target.value));
['#s-fs', '#s-ts', '#s-type', '#s-head', '#s-label'].forEach(s => $(s).addEventListener('change', setConn));
['#s-w', '#s-h', '#s-aria'].forEach(s => $(s).addEventListener('change', setBoard));
$('#s-state').innerHTML = STATES.map(s => '<option value="' + s + '">' + s + '</option>').join('');

/*NOTEBOOK*/

/* ---------- start ---------- */
doc.innerHTML = STARTER; prep(); histReset(); status(); whoUI(); thinUI(); chromeHeight(); $$('#tbar button.t').forEach(x => x.classList.add('dim'));
try { const d = localStorage.getItem(PRODUCT.key + '-draft'); if (d && d !== clean().innerHTML) $('#draft').hidden = false; } catch (e) { }
chromeHeight();
NB.init();
window.FLE = { load, build, NB, ADD, activate, connect, select, newDiagram, DE, boardToDrawio, svgToDrawio, mermaidToDrawio, withPictures, unbundle, get board() { return board; } };
})();
