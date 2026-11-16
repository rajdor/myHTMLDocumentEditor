(function () {
'use strict';
const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
const doc = $('#doc'), idx = $('#idx'), dbar = $('#dbar'), statusEl = $('#status');
const DOC_CSS = $('#doc-css').textContent;
const FIT_JS = "function fit(){document.querySelectorAll('.fig').forEach(function(f){var b=f.firstElementChild;if(!b)return;var w=parseFloat(b.style.width),h=parseFloat(b.style.height);f.style.maxWidth='';var s=Math.min(1,f.clientWidth/w);b.style.transform='scale('+s+')';f.style.maxWidth=w+'px';f.style.height=(h*s)+'px';});}window.addEventListener('resize',fit);fit();";
const STARTER = '<h1>Untitled document</h1><p class="sub">Subtitle</p><h2>Section</h2><p>Start writing.</p>';
const STATES = ['note', 'good', 'bad', 'warning', 'alert', 'critical', 'new', 'changed', 'retire', 'neutral'];
let board = null, sel = null, selC = null, mode = null, connFrom = null, editing = null, lastRange = null;
let idxDepth = 1, showNotes = false, handle = null, fname = 'document.html', dirty = false, undo = [], timer = null, cascade = 0;

const uid = () => 'w' + Math.random().toString(36).slice(2, 9);
const snap = (v, e) => (e && e.altKey) ? Math.round(v) : Math.round(v / 8) * 8;
const esc = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function el(html) { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; }

/* ---------- document: index, fit, status ---------- */
function fit() {
  $$('.fig', doc).forEach(f => {
    const b = f.firstElementChild; if (!b) return;
    const w = parseFloat(b.style.width), h = parseFloat(b.style.height);
    f.style.maxWidth = ''; const s = Math.min(1, f.clientWidth / w);
    b.style.transform = 'scale(' + s + ')'; f.style.maxWidth = w + 'px'; f.style.height = (h * s) + 'px';
  });
}
function slug(t) { return t.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'section'; }
const HEADS = 'h2,h3,h4';
function heads(root) { return $$(HEADS, root).filter(h => !h.closest('.fig,.dg,td,th')); }
function indexHtml(root, depth) {
  const top = [], stack = [];
  heads(root).forEach(h => {
    let L = +h.tagName[1] - 1; if (L > depth) return;
    const n = { h, kids: [] };
    if (L === 1) { top.push(n); stack.length = 0; stack.push(n); return; }
    if (!stack.length) { top.push(Object.assign(n, { loose: true })); return; }
    L = Math.min(L, stack.length + 1); stack.length = L - 1; stack[L - 2].kids.push(n); stack.push(n);
  });
  const r = list => list.map(n => '<li' + (n.loose ? ' class="u"' : '') + '><a href="#' + n.h.id + '">' + esc(n.h.textContent) + '</a>' + (n.kids.length ? '<ol>' + r(n.kids) + '</ol>' : '') + '</li>').join('');
  return r(top);
}
function rebuild() {
  const seen = {};
  heads(doc).forEach(h => { const base = slug(h.textContent); let s = base, k = 1; while (seen[s]) s = base + '-' + (++k); seen[s] = 1; h.id = s; });
  idx.innerHTML = indexHtml(doc, idxDepth); $('#s-index').value = String(idxDepth); notesUI();
  const h1 = $('h1', doc); document.title = (h1 ? h1.textContent.trim() : 'Document') + ' - editor';
}
idx.addEventListener('click', e => { const a = e.target.closest('a'); if (!a) return; e.preventDefault(); const t = document.getElementById(a.getAttribute('href').slice(1)); if (t) t.scrollIntoView({ behavior: 'smooth' }); });
let remoteImgs = 0;
function status() { const sv = $('[data-a="save"]'); sv.classList.toggle('has', dirty); sv.title = 'Save (Ctrl+S)' + (dirty ? ': unsaved changes' : ''); statusEl.textContent = [remoteImgs ? remoteImgs + (remoteImgs === 1 ? ' web item shown as a link card' : ' web items shown as link cards') + ', not downloaded' : ''].filter(Boolean).join(' | '); helpInfo(); }
/* The editor version and the document name are shown in the Help dialog. */
function helpInfo() { const i = $('#help-info'); if (i) i.textContent = 'Editor v' + VERSION + ' | Document: ' + fname + (dirty ? ' (unsaved changes)' : '') + (statusEl.textContent ? ' | ' + statusEl.textContent : ''); }
function keepGoing(what) { return !dirty || confirm('This document has unsaved changes. Save it first if you want to keep them.\n\nOK: discard the changes and ' + what + '.\nCancel: go back to the document.'); }
function touch() {
  dirty = true; status(); clearTimeout(timer);
  timer = setTimeout(() => { histSnap(); try { localStorage.setItem('fle-draft', clean().innerHTML); } catch (e) { } }, 400);
}
doc.addEventListener('input', touch);
/* Document history: whole-document snapshots, so structural changes (tables, Q&A, code, Clear format, diagrams) undo as well as typing. */
let hist = [], hpos = -1;
function nodePath(n) { const p = []; while (n && n !== doc) { const par = n.parentNode; if (!par) return null; p.unshift([...par.childNodes].indexOf(n)); n = par; } return n === doc ? p : null; }
function fromPath(p) { let n = doc; for (const i of p) { n = n.childNodes[i]; if (!n) return null; } return n; }
function selState() { const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return null; const r = s.getRangeAt(0), p = nodePath(r.startContainer); return p ? { p, o: r.startOffset } : null; }
function histSnap() {
  rebuild(); const h = doc.innerHTML.replace(/ ?\bed-dsel\b/g, ''); if (hpos >= 0 && hist[hpos].h === h) { hist[hpos].sel = selState() || hist[hpos].sel; return; }
  hist = hist.slice(0, hpos + 1); hist.push({ h, sel: selState() }); if (hist.length > 80) hist.shift(); hpos = hist.length - 1;
}
function histReset() { hist = []; hpos = -1; histSnap(); }
function histGo(d) {
  if (board) { if (d < 0) undoDiagram(); return; }
  clearTimeout(timer); histSnap(); const i = hpos + d; if (i < 0 || i >= hist.length) return;
  hpos = i; const e = hist[i]; deactivate(); doc.innerHTML = e.h; prepView();
  if (e.sel) { const n = fromPath(e.sel.p); if (n) { try { const r = document.createRange(); r.setStart(n, Math.min(e.sel.o, n.nodeType === 3 ? n.length : n.childNodes.length)); r.collapse(true); const s = getSelection(); s.removeAllRanges(); s.addRange(r); lastRange = r.cloneRange(); } catch (x) { } } }
  dirty = true; status(); rebuild(); styleUI();
}
doc.addEventListener('keydown', e => { if (!e.ctrlKey && !e.metaKey && (e.key === ' ' || e.key === 'Enter' || /^[.,;:!?]$/.test(e.key))) { clearTimeout(timer); histSnap(); } }, true);
doc.addEventListener('beforeinput', e => { if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') { e.preventDefault(); histGo(e.inputType === 'historyUndo' ? -1 : 1); } });
window.addEventListener('resize', fit);
window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
function chromeHeight() { document.documentElement.style.setProperty('--ch', $('#chrome').offsetHeight + 'px'); }
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
  [['bold', 'bold'], ['italic', 'italic'], ['ul', 'insertUnorderedList'], ['ol', 'insertOrderedList']].forEach(([a, c]) => { let on = false; try { on = document.queryCommandState(c); } catch (e) { } $('[data-a="' + a + '"]').classList.toggle('on', on); });
}
function live() { const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) { let n = s.anchorNode; if (n.nodeType !== 1) n = n.parentElement; if (!n.closest('.fig')) lastRange = s.getRangeAt(0).cloneRange(); } }
function restore() { doc.focus(); if (lastRange) { const s = getSelection(); s.removeAllRanges(); s.addRange(lastRange); } }
function curBlock() { let n = lastRange ? lastRange.startContainer : null; if (!n) return null; if (n.nodeType !== 1) n = n.parentElement; while (n && n.parentNode !== doc && !(n.parentNode.classList && n.parentNode.classList.contains('note-body'))) n = n.parentNode; return n && n.closest('.note-log') ? n.closest('.note') : n; }
function cmd(c, v) { restore(); document.execCommand(c, false, v); touch(); }
function setBlock(v) {
  live();
  const [tag, cls] = v.split('.'); const qa = qaItem(lastRange);
  if (tag === 'dt' || tag === 'dd' || qa) { qaConvert(tag, cls); return; }
  restore(); document.execCommand('formatBlock', false, tag);
  let n = getSelection().anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; n = n && n.closest('p,h1,h2,h3,h4,pre');
  if (n && doc.contains(n)) { if (cls) n.className = cls; else n.removeAttribute('class'); }
  touch();
}
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
function editLink() {
  live(); let n = lastRange && lastRange.startContainer; if (n && n.nodeType !== 1) n = n.parentElement;
  const a = n && n.closest('a:not(.link-card)'), old = a ? a.getAttribute('href') : 'https://';
  const u = prompt(a ? 'Link address (clear it to remove the link)' : 'Link address', old); if (u === null) return;
  const v = u.trim();
  if (!v) { if (a) { a.replaceWith(...a.childNodes); touch(); } return; }
  if (!SAFE_URL.test(v)) { alert('Links can be web addresses (https://), email (mailto:), phone (tel:) or a place in this document (#).'); return; }
  if (a) { a.setAttribute('href', v); touch(); return; }
  restore(); if (getSelection().isCollapsed) { document.execCommand('insertHTML', false, '<a href="' + esc(v) + '">' + esc(v) + '</a>'); } else document.execCommand('createLink', false, v);
  touch();
}
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
  $$('.note-log', root).forEach(d => { d.removeAttribute('open'); const sm = $(':scope > summary', d); if (sm) { sm.innerHTML = ''; sm.setAttribute('contenteditable', 'false'); } });
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
const INLINE = 'b,strong,i,em,u,s,strike,span,a,font,code,mark,small,big,sub,sup';
/* Clear format. With the cursor only, or when a block is wholly selected, the block loses its inline formatting and
   becomes a plain paragraph (list items and cells stay what they are). With part of a block selected, only the selected
   text loses its inline formatting and the block style stays. Links and ID tags are never removed. */
const clearable = e => !e.matches('a,span.id') && !e.closest('.fig,.dg,[class*="wb-"]') && !e.matches('[class*="wb-"]') && !e.querySelector('svg,img');
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
  if (!blocks.length) return;
  const txt = t => t.replace(/[\s ​]+/g, '');
  const jobs = blocks.map(b => {
    const ir = document.createRange(); ir.selectNodeContents(b);
    if (b.contains(r.startContainer)) ir.setStart(r.startContainer, r.startOffset);
    if (b.contains(r.endContainer)) ir.setEnd(r.endContainer, r.endOffset);
    return { b, ir, whole: r.collapsed || txt(ir.toString()) === txt(b.textContent) };
  });
  const dls = new Set(); let last = null, picked = null;
  jobs.forEach(({ b, ir, whole }) => {
    if (!whole) { if (b.matches('pre')) { last = b; return; } const o = clearPart(b, ir); if (jobs.length === 1) picked = o; last = b; return; }
    $$(INLINE, b).filter(clearable).reverse().forEach(e => e.replaceWith(...e.childNodes));
    b.removeAttribute('style');
    if (b.matches('li,td,th')) { last = b; return; }
    if (b.matches('pre')) [...b.childNodes].filter(n => n.nodeType === 3 && n.data.includes('\n')).forEach(n => { const f = document.createDocumentFragment(); n.data.replace(/\n$/, '').split('\n').forEach((t, i) => { if (i) f.appendChild(document.createElement('br')); f.appendChild(document.createTextNode(t)); }); n.replaceWith(f); });
    if (b.matches('dt,dd')) dls.add(b.parentNode);
    const p = document.createElement('p'); p.append(...b.childNodes); if (!p.childNodes.length) p.innerHTML = '<br>'; b.replaceWith(p); last = p;
  });
  dls.forEach(dl => {
    const parts = []; let cur = null;
    [...dl.children].forEach(c => { if (c.tagName === 'P') { parts.push(c); cur = null; } else { if (!cur) { cur = mk('dl', 'qa', ''); parts.push(cur); } cur.appendChild(c); } });
    dl.replaceWith(...parts);
  });
  if (picked) { const g = getSelection(); g.removeAllRanges(); g.addRange(picked); lastRange = picked.cloneRange(); } else if (last) caret(last, true);
  touch(); styleUI();
}
function insertBlock(node) { const b = curBlock(); if (b) b.after(node); else doc.appendChild(node); touch(); }
/* Drag and drop: content dragged within the document moves as usual (it is already clean); anything dropped from
   outside arrives as plain text, and a dropped .html file is opened through the same cleaning as Open. */
let dragInside = false;
doc.addEventListener('dragstart', () => { dragInside = true; });
document.addEventListener('dragend', () => { dragInside = false; });
doc.addEventListener('drop', async e => {
  if (dragInside) { dragInside = false; return; }
  e.preventDefault(); const dt = e.dataTransfer; if (!dt) return;
  const f = dt.files && dt.files[0];
  if (f) { if (/\.html?$/i.test(f.name)) { if (!keepGoing('open the dropped document')) return; handle = null; load(await f.text(), f.name); } return; }
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
  bold: () => { let w = false; try { w = document.queryCommandState('bold'); } catch (e) { } return [w ? 'Bold' : 'Bold off', () => { restore(); setInline('bold', 'b,strong', w); }]; },
  italic: () => { let w = false; try { w = document.queryCommandState('italic'); } catch (e) { } return [w ? 'Italic' : 'Italic off', () => { restore(); setInline('italic', 'i,em', w); }]; },
  ul: () => { let w = false; try { w = document.queryCommandState('insertUnorderedList'); } catch (e) { } return [w ? 'Bulleted list' : 'Bulleted list off', () => { restore(); if (document.queryCommandState('insertUnorderedList') !== w) document.execCommand('insertUnorderedList'); }]; },
  ol: () => { let w = false; try { w = document.queryCommandState('insertOrderedList'); } catch (e) { } return [w ? 'Numbered list' : 'Numbered list off', () => { restore(); if (document.queryCommandState('insertOrderedList') !== w) document.execCommand('insertOrderedList'); }]; },
  clear: () => ['Clear format', clearFormat],
  note: () => ['Note', addNote], code: () => ['Insert code block', addCode], qa: () => ['Insert Q&A list', addQa],
  tag: () => ['ID tag', () => { restore(); let n = getSelection().anchorNode; if (n && n.nodeType !== 1) n = n.parentElement; if (n && n.closest('span.id')) return; ACT.tag(); }],
  dense: () => { live(); const c = cell(), w = !!(c && c.closest('table').classList.contains('dense')); return [w ? 'Compact table' : 'Compact table off', () => { if (!inTable()) return; if (cell().closest('table').classList.contains('dense') !== w) tableOp('dense'); }]; }
};
[['r+', 'Add row below'], ['ra', 'Add row above'], ['r-', 'Delete row'], ['c+', 'Add column right'], ['cl', 'Add column left'], ['c-', 'Delete column'], ['mr', 'Merge right'], ['md', 'Merge down'], ['split', 'Split cell']].forEach(([op, label]) => { REP[op] = () => [label, () => { if (inTable()) tableOp(op); }]; });
function repNote(a) { if (REP[a]) { const [label, run] = REP[a](); repSet(label, run); } }
function repeatLast() {
  if (!lastCmd || editing || board || DE.open) return;
  const s = getSelection(); if (s.rangeCount && doc.contains(s.anchorNode)) live(); else if (!lastRange) return;
  clearTimeout(timer); histSnap(); lastCmd.run(); touch(); styleUI();
}
document.addEventListener('keydown', e => {
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyQ' && !DE.open && !$('#help').open) { e.preventDefault(); repeatLast(); return; }
  // Bold and Italic by their own shortcuts count as the toolbar commands
  if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && (e.key === 'b' || e.key === 'i' || e.key === 'B' || e.key === 'I') && doc.contains(e.target) && !editing) { const a = e.key.toLowerCase() === 'b' ? 'bold' : 'italic'; setTimeout(() => repNote(a), 0); }
}, true);
doc.addEventListener('mouseup', e => { if (e.altKey && !e.ctrlKey && !e.metaKey && e.button === 0 && !paint && lastCmd && !(e.target.closest && e.target.closest('.fig,.dg,.note-log'))) setTimeout(repeatLast, 0); });

/* ---------- clipboard ----------
   Copy and cut put the selection on the clipboard as the document's own clean HTML (marked data-fle-clip), so paste
   brings it back exactly: inline formatting, headings, lists, tables, code and diagrams. HTML from other programs is
   reduced to the structure this editor has (headings, paragraphs, lists, tables, bold, italics, links, code) and takes
   the document's style. Everything pasted goes through the same cleaning as Open. Code blocks take plain text. */
const CLIP_INLINE = /^(B|STRONG|I|EM|U|S|SUB|SUP|A|CODE|SPAN|MARK)$/, CLIP_WRAP = /^(UL|OL|DL|TABLE|THEAD|TBODY|TFOOT|TR)$/;
const BLOCKS = 'p,h1,h2,h3,h4,ul,ol,dl,pre,table,div,details';
const hasContent = n => !!(n.textContent.replace(/[\s ​]+/g, '') || (n.querySelector && n.querySelector('img,svg,.dg,.fig,table')));
function clipClean(box) {
  $$('.ed-handle', box).forEach(n => n.remove());
  $$('.note-log', box).forEach(n => n.remove());
  $$('.note-body', box).forEach(n => n.replaceWith(...n.childNodes));
  $$('.note', box).forEach(n => n.replaceWith(...n.childNodes));
  $$('[class]', box).forEach(n => { n.classList.remove('ed-sel', 'ed-selc', 'ed-active', 'ed-from', 'ed-connect', 'ed-dsel', 'note-date', 'note-who'); if (!n.getAttribute('class')) n.removeAttribute('class'); });
  $$('[contenteditable]', box).forEach(n => n.removeAttribute('contenteditable'));
  $$('.dg, .fig', box).forEach(n => n.removeAttribute('title'));
  $$('a[data-ed-title]', box).forEach(a => { a.removeAttribute('title'); a.removeAttribute('data-ed-title'); });
  $$('[id]', box).forEach(n => { if (!n.closest('.fig,.dg,svg')) n.removeAttribute('id'); });
}
function clipFrom(r) {
  const box = document.createElement('div'); box.appendChild(r.cloneContents());
  const last = box.lastChild; if (r.endOffset === 0 && last && last.nodeType === 1 && box.children.length > 1 && !hasContent(last)) last.remove();
  const first = box.firstChild; if (first && first.nodeType === 1 && box.children.length > 1 && !hasContent(first)) first.remove();
  let n = r.commonAncestorContainer; if (n.nodeType !== 1) n = n.parentNode;
  for (; n && n !== doc && (CLIP_INLINE.test(n.tagName) || CLIP_WRAP.test(n.tagName) || n.matches('div.tw')); n = n.parentNode) { const w = n.cloneNode(false); w.append(...box.childNodes); box.appendChild(w); }
  clipClean(box); return box;
}
function onCopy(e, cut) {
  if (editing || board) return;
  const s = getSelection(); let box = null, text = '';
  if (s.rangeCount && !s.isCollapsed && doc.contains(s.anchorNode) && doc.contains(s.focusNode)) {
    if (blockOf(s.anchorNode) && blockOf(s.anchorNode) === blockOf(s.focusNode)) return; // inside one code block: plain text, as the browser does it
    box = clipFrom(s.getRangeAt(0)); text = s.toString();
  } else if (dgSel && !cut && (!s.rangeCount || s.isCollapsed)) { box = document.createElement('div'); box.appendChild(dgSel.cloneNode(true)); clipClean(box); text = dgTitle(dgSel) || 'Diagram'; }
  if (!box) return;
  e.preventDefault(); box.setAttribute('data-fle-clip', '1');
  e.clipboardData.setData('text/html', box.outerHTML); e.clipboardData.setData('text/plain', text);
  if (cut) { clearTimeout(timer); histSnap(); document.execCommand('delete'); touch(); }
}
document.addEventListener('copy', e => onCopy(e, false));
document.addEventListener('cut', e => onCopy(e, true));
const SAFE_HREF = /^\s*(https?:|mailto:|tel:|#)/i;
const KEEP = { P: [], BR: [], B: [], STRONG: [], I: [], EM: [], SUB: [], SUP: [], A: ['href'], CODE: [], PRE: [], H2: [], H3: [], H4: [], UL: [], OL: [], LI: [], TABLE: [], THEAD: [], TBODY: [], TFOOT: [], TR: [], TH: ['colspan', 'rowspan'], TD: ['colspan', 'rowspan'], IMG: ['src', 'alt', 'width', 'height'] };
const BOXY = /^(DIV|SECTION|ARTICLE|HEADER|FOOTER|MAIN|ASIDE|FIGURE|FIGCAPTION|BLOCKQUOTE|ADDRESS|CENTER|NAV|DT|DD|DETAILS|SUMMARY)$/;
function rename(e, tag) { const n = document.createElement(tag); n.append(...e.childNodes); e.replaceWith(n); return n; }
/* HTML from another program: keep the structure, drop its styling. */
function foreign(box) {
  $$('style,title,svg,math,head,xml,colgroup,col,caption,hr,noscript,template,canvas,map,area', box).forEach(n => n.remove());
  $$('*', box).reverse().forEach(e => {
    if (!e.parentNode || e.closest('a.link-card')) return;
    const st = (e.getAttribute('style') || '').replace(/\s+/g, '').toLowerCase();
    const bold = /font-weight:(bold|[6-9]00)/.test(st), plain = /font-weight:(normal|[1-4]00)/.test(st), ital = /font-style:italic/.test(st);
    let t = e.tagName;
    if (t === 'H1') { e = rename(e, 'h2'); t = 'H2'; } else if (t === 'H5' || t === 'H6') { e = rename(e, 'h4'); t = 'H4'; }
    if ((t === 'B' || t === 'STRONG') && plain) { e.replaceWith(...e.childNodes); return; }
    if (t === 'A' && !SAFE_HREF.test(e.getAttribute('href') || '')) { e.replaceWith(...e.childNodes); return; }
    if (t === 'IMG' && !/^\s*data:image\//i.test(e.getAttribute('src') || '')) { e.remove(); return; }
    if (KEEP[t]) { [...e.attributes].forEach(a => { if (!KEEP[t].includes(a.name.toLowerCase())) e.removeAttribute(a.name); }); return; }
    if (BOXY.test(t)) { if (e.querySelector(BLOCKS)) e.replaceWith(...e.childNodes); else if (hasContent(e)) rename(e, 'p'); else e.remove(); return; }
    if (bold || ital) { let w = e; if (bold) w = rename(w, 'b'); if (ital) { if (bold) { const i = document.createElement('i'); i.append(...w.childNodes); w.appendChild(i); } else rename(w, 'i'); } return; }
    e.replaceWith(...e.childNodes);
  });
  $$('li,td,th', box).forEach(c => $$(':scope > p', c).forEach(p => { if (p.nextSibling && hasContent(p)) p.after(document.createElement('br')); p.replaceWith(...p.childNodes); }));
  $$('pre', box).forEach(pre => { const lines = pre.textContent.replace(/\n$/, '').split('\n'); pre.textContent = ''; lines.forEach((t, i) => { if (i) pre.appendChild(document.createElement('br')); if (t) pre.appendChild(document.createTextNode(t)); }); });
  $$('p,h2,h3,h4,li', box).forEach(n => { if (!hasContent(n) && !n.closest('table')) n.remove(); });
  $$('ul,ol', box).forEach(l => { if (!l.children.length) l.remove(); });
  $$('table', box).forEach(t => { if (!t.rows.length) { t.remove(); return; } if (!(t.parentNode.classList && t.parentNode.classList.contains('tw'))) { const w = document.createElement('div'); w.className = 'tw'; t.replaceWith(w); w.appendChild(t); } });
}
function clipRead(html) {
  const d = new DOMParser().parseFromString(html, 'text/html'), own = d.querySelector('[data-fle-clip]'), box = own || d.body;
  const w = d.createTreeWalker(box, NodeFilter.SHOW_COMMENT), cs = []; while (w.nextNode()) cs.push(w.currentNode); cs.forEach(c => c.remove());
  $$('script,nav,link,meta', box).forEach(n => n.remove());
  sanitize(box); remoteImgs += cardify(box);
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
  const LEAF = 'p,h1,h2,h3,h4,li,dt,dd,td,th,pre';
  return $$(LEAF, box).filter(x => !$(LEAF, x) && hasContent(x)).map(x => x.innerHTML.replace(/(<br>\s*)+$/, '')).join('<br>');
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
function clipInsert(box) {
  const s = getSelection(); if (!s.rangeCount || !doc.contains(s.anchorNode)) return;
  if (!box.querySelector(BLOCKS + ',.dg,.fig')) { insertInline(box.innerHTML); return; }
  let at = s.anchorNode; if (at.nodeType !== 1) at = at.parentElement;
  const li = at.closest('li'), lists = [...box.children].every(c => c.matches('ul,ol'));
  if (li && doc.contains(li) && !cellEl() && lists && !s.isCollapsed) document.execCommand('delete');
  if (li && doc.contains(li) && li.isConnected && !cellEl() && lists) {
    const items = $$(':scope > ul > li, :scope > ol > li', box); if (!items.length) return;
    if (hasContent(li)) li.after(...items); else li.replaceWith(...items);
    clipAdopt(items); caret(items[items.length - 1], true); return;
  }
  if (cellEl() || at.closest('li,dt,dd,.note-log')) { const h = clipLines(box); if (h) insertInline(h); return; }
  if (!s.isCollapsed) document.execCommand('delete');
  const r = getSelection().getRangeAt(0); let cur = r.startContainer; if (cur === doc) cur = doc.childNodes[r.startOffset] || doc.lastChild;
  while (cur && cur.parentNode !== doc && !(cur.parentNode.classList && cur.parentNode.classList.contains('note-body'))) cur = cur.parentNode;
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
  if (editing) return; e.preventDefault(); const t = e.clipboardData.getData('text/plain'), h = e.clipboardData.getData('text/html');
  clearTimeout(timer); histSnap();
  if (blockOf(getSelection().anchorNode)) codeInsert(t);
  else if (h && h.trim()) { const box = clipRead(h); if (hasContent(box)) clipInsert(box); else if (t) document.execCommand('insertText', false, t); fit(); styleUI(); }
  else if (inCell()) document.execCommand('insertHTML', false, t.split(/\r?\n/).map(esc).join('<br>'));
  else document.execCommand('insertText', false, t);
  touch();
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
function tSelRect(T, c) {
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
  let focus = c;
  if (op === 'r+') {
    let at = r2, sec = T.rows[at].sec;
    if (headRow(at)) { sec = t.tBodies[0] || t.createTBody(); const first = T.rows.findIndex(x => x.sec === sec); at = (first < 0 ? T.rows.length : first) - 1; }
    const src = Math.max(0, at), tmpl = T.M[src] || [], next = T.M[at + 1], fromHead = headRow(src), tr = document.createElement('tr');
    if (!fromHead && T.rows[src].tr.className) tr.className = T.rows[src].tr.className;
    const row = []; for (let k = 0; k < W; k++) { const x = tmpl[k]; if (!fromHead && x && next && next[k] === x) { row[k] = x; continue; } row[k] = newCellLike(fromHead ? null : x, false); }
    T.M.splice(at + 1, 0, row); T.rows.splice(at + 1, 0, { tr, sec });
    const after = T.rows[at + 2]; if (after && after.sec === sec) after.tr.before(tr); else sec.appendChild(tr);
    focus = row.find(x => x && !tmpl.includes(x)) || focus;
  }
  if (op === 'ra') {
    if (headRow(r)) { alert('A row cannot go above the heading row.'); return; }
    const sec = T.rows[r].sec, tmpl = T.M[r], prev = T.rows[r - 1] && T.rows[r - 1].sec === sec ? T.M[r - 1] : null, tr = document.createElement('tr');
    if (T.rows[r].tr.className) tr.className = T.rows[r].tr.className;
    const row = []; for (let k = 0; k < W; k++) { const x = tmpl[k]; if (x && prev && prev[k] === x) { row[k] = x; continue; } row[k] = newCellLike(x, false); }
    T.rows[r].tr.before(tr); T.M.splice(r, 0, row); T.rows.splice(r, 0, { tr, sec });
    focus = row.find(x => x && !tmpl.includes(x)) || focus;
  }
  if (op === 'cl') {
    T.M.forEach((m, i) => { const x = m[col]; if (x && col > 0 && m[col - 1] === x) { m.splice(col, 0, x); return; } m.splice(col, 0, newCellLike(x, headRow(i))); });
    focus = T.M[r][col];
  }
  if (op === 'r-') {
    if (headRow(r)) { alert('The heading row stays; clear its text instead.'); return; }
    if (T.rows.filter(x => x.sec.tagName !== 'THEAD').length <= (r2 - r + 1)) { alert('A table needs at least one body row.'); return; }
    T.M.splice(r, r2 - r + 1); T.rows.splice(r, r2 - r + 1).forEach(x => x.tr.remove()); focus = (T.M[r] || T.M[r - 1] || [])[col] || null;
  }
  if (op === 'c+') {
    T.M.forEach((m, i) => { const x = m[col2]; if (x && m[col2 + 1] === x) { m.splice(col2 + 1, 0, x); return; } m.splice(col2 + 1, 0, newCellLike(x, headRow(i))); });
    focus = T.M[r][col2 + 1];
  }
  if (op === 'c-') {
    if (W - (col2 - col + 1) < 1) { alert('A table needs at least one column.'); return; }
    T.M.forEach(m => m.splice(col, col2 - col + 1)); focus = null;
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
    else { T.M.forEach((m, i) => { const x = m[col]; m.splice(col + 1, 0, i === r ? newCellLike(c, headRow(i)) : x); }); focus = T.M[r][col + 1]; }
  }
  tRebuild(T); touch(); if (focus && focus.isConnected) caret(focus, true);
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
function addQa() {
  const dl = el('<dl class="qa"><dt><br></dt></dl>'); insertBlock(dl); caret(dl.firstChild); styleUI();
}
function frag(r) { const f = r.cloneContents(), out = []; const w = document.createTreeWalker(f, NodeFilter.SHOW_ALL); let n; while ((n = w.nextNode())) out.push(n); return out; }
function lineText(nodes, reverse) { let t = ''; for (const n of (reverse ? nodes.reverse() : nodes)) { if (n.nodeName === 'BR') break; if (n.nodeType === 3) t += n.data; } return t.trim(); }
function qaEnter(item, shift) {
  const s = getSelection(), r = s.getRangeAt(0);
  if (shift) { document.execCommand('insertLineBreak'); touch(); return; }
  if (item.tagName === 'DT') {
    if (!item.textContent.trim()) { const p = mk('p'); splitOut(item, p); caret(p); touch(); return; }
    let dd = item.nextElementSibling; if (!dd || dd.tagName !== 'DD') { dd = mk('dd'); item.after(dd); }
    caret(dd, true); touch(); return;
  }
  const after = document.createRange(); after.setStart(r.endContainer, r.endOffset); after.setEnd(item, item.childNodes.length);
  const before = document.createRange(); before.setStart(item, 0); before.setEnd(r.startContainer, r.startOffset);
  const atEnd = !after.toString().trim(), empty = atEnd && !lineText(frag(before), true);
  if (!empty) { document.execCommand('insertLineBreak'); touch(); return; }
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
  const g = e.target.closest('.dg, .fig'); dgSelect(g || null); if (g) { deactivate(); e.preventDefault(); return; }
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
  const g = e.target.closest('.dg, .fig'); if (g) { e.preventDefault(); openDiagram(g); return; } const b = e.target.closest('.wb-board'); if (!b || editing) return; const it = itemAt(e.target, b); if (it && !it.dataset.conn) startEdit(it); });
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
  if (ctrl && !e.altKey && !board && !e.target.closest('#chrome') && (k.toLowerCase() === 'z' || k.toLowerCase() === 'y')) { e.preventDefault(); histGo(k.toLowerCase() === 'y' || e.shiftKey ? 1 : -1); return; }
  if (dgSel && !ctrl && !e.target.closest('#chrome')) { if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); dgDelete(); return; } if (k === 'Enter') { e.preventDefault(); openDiagram(dgSel); return; } if (k === 'Escape') { dgSelect(null); return; } }
  if (ctrl && k.toLowerCase() === 's') { e.preventDefault(); save(e.shiftKey); return; }
  if (ctrl && k.toLowerCase() === 'o') { e.preventDefault(); open(); return; }
  if (k === 'Tab' && !ctrl && !e.altKey && !editing) { const c = cellEl(); if (c) { e.preventDefault(); cellTab(c, e.shiftKey); return; } }
  if ((k === 'ArrowDown' || k === 'ArrowUp') && !e.shiftKey && !ctrl && !e.altKey && !editing) { const c = cellEl(); if (c && cellArrow(c, k === 'ArrowDown')) { e.preventDefault(); return; } }
  if (k === 'Enter' && !ctrl && !e.altKey && !editing) { const q = qaItem(); if (q) { e.preventDefault(); qaEnter(q, e.shiftKey); return; } }
  if (!editing && !ctrl && !e.altKey && (k === 'Enter' || k === 'Tab')) { const pre = blockOf(getSelection().anchorNode); if (pre) { e.preventDefault(); if (k === 'Tab') { if (!e.shiftKey) codeInsert('\t'); } else if (e.shiftKey) { document.execCommand('insertLineBreak'); touch(); } else codeEnter(pre); return; } }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing) { const s1 = getSelection(); let n1 = s1.anchorNode; if (n1 && n1.nodeType !== 1) n1 = n1.parentElement; const lp = n1 && n1.closest('.note-entries > p'); if (lp && doc.contains(lp)) { e.preventDefault(); const who = initials(); if (!who) return; const line = mk('p', '', '<b class="note-who"></b>&nbsp;'); line.firstChild.textContent = who; lp.after(line); caret(line, true); touch(); return; } }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing && !inCell()) { const s0 = getSelection(); let n0 = s0.anchorNode; if (n0 && n0.nodeType !== 1) n0 = n0.parentElement; const pb = n0 && n0.closest('.note-body > p'); if (pb && !pb.textContent.trim() && !pb.nextElementSibling && pb.previousElementSibling) { e.preventDefault(); const note = pb.closest('.note'); pb.remove(); const q = mk('p'); note.after(q); caret(q); touch(); styleUI(); return; } }
  if (k === 'Enter' && !e.shiftKey && !ctrl && !e.altKey && !editing && !inCell()) { const p = styledParaEnd(); if (p) { e.preventDefault(); const n = mk('p'); p.after(n); caret(n); touch(); styleUI(); return; } }
  if (k === 'Enter' && !ctrl && !e.altKey && !editing && inCell()) { e.preventDefault(); document.execCommand('insertLineBreak'); touch(); return; }
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
const DE = { frame: null, ready: false, pending: null, target: null, open: false, src: null };
let dgSel = null;
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
function openDiagram(fig) {
  if (DE.open) return;
  deactivate(); dgSelect(null);
  DE.target = fig || null; DE.open = true;
  const board = fig && fig.querySelector('.wb-board');
  const xml = !fig ? '' : board ? boardToDrawio(board) : (fig.getAttribute('data-drawio') || '');
  const msg = { type: 'de:init', xml, title: dgTitle(fig), mode: 'blueprint' };
  $('#de-overlay').hidden = false; document.documentElement.classList.add('de-open');
  deFrame();
  if (DE.ready) DE.frame.contentWindow.postMessage(msg, '*'); else DE.pending = msg;
}
function closeDiagram() { DE.open = false; DE.target = null; $('#de-overlay').hidden = true; document.documentElement.classList.remove('de-open'); }
function dgApply(m) {
  if (typeof m.svg !== 'string' || !/^\s*<svg[\s>]/i.test(m.svg)) { alert('The diagram editor returned no picture; the document was not changed.'); return; }
  const tmp = document.createElement('div'); tmp.innerHTML = m.svg; const svg = tmp.querySelector('svg'); if (!svg) return;
  sanitize(tmp); cardify(tmp);
  let fig = DE.target && doc.contains(DE.target) ? DE.target : null;
  if (fig && !fig.classList.contains('dg')) { const n = document.createElement('div'); n.className = 'dg'; fig.replaceWith(n); fig = n; } // a page diagram, now converted
  if (!fig) {
    fig = document.createElement('div'); fig.className = 'dg';
    const b = curBlock(); if (b) b.after(fig); else doc.appendChild(fig);
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
  if (m.type === 'de:ready') { DE.ready = true; if (DE.pending) { DE.frame.contentWindow.postMessage(DE.pending, '*'); DE.pending = null; } }
  else if (m.type === 'de:save' && DE.open) { dgApply(m); closeDiagram(); }
  else if (m.type === 'de:cancel' && DE.open) closeDiagram();
});
function dgSelect(f) { $$('.ed-dsel', doc).forEach(n => n.classList.remove('ed-dsel')); dgSel = f; if (f) f.classList.add('ed-dsel'); $('#gbar').hidden = !f; chromeHeight(); }
function dgDelete() { if (!dgSel || !confirm('Delete this diagram?')) return; const f = dgSel; dgSelect(null); const cap = f.nextElementSibling; f.remove(); if (cap && cap.classList.contains('cap') && /^Figure\.\s*Caption$/.test(cap.textContent.trim())) cap.remove(); touch(); }

/*CONVERT*/
/* ---------- load and save ---------- */
function clean() {
  const c = doc.cloneNode(true);
  $$('.ed-handle', c).forEach(n => n.remove());
  $$('.ed-sel,.ed-selc,.ed-active,.ed-from,.ed-connect', c).forEach(n => n.classList.remove('ed-sel', 'ed-selc', 'ed-active', 'ed-from', 'ed-connect'));
  $$('[contenteditable]', c).forEach(n => n.removeAttribute('contenteditable'));
  $$('.fig', c).forEach(f => { f.style.height = ''; f.style.maxWidth = ''; if (f.firstElementChild) f.firstElementChild.style.transform = ''; if (!f.getAttribute('style')) f.removeAttribute('style'); });
  $$('.dg, .fig', c).forEach(n => { n.classList.remove('ed-dsel'); n.removeAttribute('title'); });
  $$('.note-log[open]', c).forEach(d => d.removeAttribute('open'));
  $$('a[data-ed-title]', c).forEach(a => { a.removeAttribute('title'); a.removeAttribute('data-ed-title'); });
  $$('[class=""]', c).forEach(n => n.removeAttribute('class'));
  return c;
}
function build(opts) {
  tidyNotes(false); rebuild(); const c = clean(), h1 = $('h1', c);
  if (opts && opts.noNotes) $$('.note', c).forEach(unwrapNote);
  $$('a[href]', c).forEach(a => { if (/^\s*https?:/i.test(a.getAttribute('href'))) { a.setAttribute('target', '_blank'); a.setAttribute('rel', 'noopener noreferrer'); } });
  const nav = indexHtml(c, idxDepth);
  return '<!DOCTYPE html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<meta name="generator" content="fine-line-editor">\n<title>' + esc(h1 ? h1.textContent.trim() : 'Document') + '</title>\n<style>' + DOC_CSS + '</style>\n</head>\n<body>\n<div class="page">\n<nav aria-label="Index" data-depth="' + idxDepth + '"><b>Index</b><ol>' + nav + '</ol></nav>\n<main' + (showNotes && !(opts && opts.noNotes) ? ' class="notes-on"' : '') + '>\n' + c.innerHTML + '\n</main>\n</div>\n' + ($('.fig', c) ? '<script>' + FIT_JS + '<\/script>\n' : '') + '</body>\n</html>\n';
}
function prepView() { dgSel = null; $('#gbar').hidden = true; $$('.dg, .fig', doc).forEach(f => f.classList.remove('ed-dsel')); fit(); chromeHeight(); }
function prep() {
  migrateGrids(doc);
  dgSelect(null); $$('.dg, .fig', doc).forEach(f => { f.setAttribute('contenteditable', 'false'); f.setAttribute('title', 'Double-click to edit'); });
  $$('.wb-board', doc).forEach(b => { if (!b.parentNode.classList.contains('fig')) { const f = el('<div class="fig"></div>'); b.replaceWith(f); f.appendChild(b); } });
  $$('.fig', doc).forEach(f => f.setAttribute('contenteditable', 'false'));
  $$('.wb-board > *', doc).forEach(e => { if (!e.id && !e.dataset.conn) e.id = uid(); });
  $$('.wb-box, .wb-layer', doc).forEach(b => { if (!$(':scope > span', b)) { const t = document.createElement('span'); [...b.childNodes].filter(n => !(n.nodeType === 1 && isSvg(n))).forEach(n => t.appendChild(n)); b.appendChild(t); } });
  undo = []; rebuild(); fit();
}
function sanitize(root) {
  $$('script,iframe,object,embed,base,form,input,button,textarea,select,frame,frameset,applet,meta,link', root).forEach(n => n.remove());
  $$('*', root).forEach(n => [...n.attributes].forEach(a => {
    const k = a.name.toLowerCase(), v = a.value.replace(/[\s\u0000-\u001f]+/g, '').toLowerCase();
    if (k.startsWith('on') || k === 'srcdoc' || k === 'formaction' || (/^(href|src|xlink:href|action|data|poster|background)$/.test(k) && (v.startsWith('javascript:') || v.startsWith('vbscript:') || v.startsWith('data:text/html')))) n.removeAttribute(a.name);
  }));
  $$('animate,set,animateMotion,animateTransform', root).filter(n => /^(href|xlink:href)$/i.test(n.getAttribute('attributeName') || '')).forEach(n => n.remove());
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
  const noUrl = t => t.replace(/@import[^;]*;?/gi, '').replace(/url\(\s*(['"]?)(?!data:|#)[^)]*\1\s*\)/gi, 'none');
  $$('[style]', root).forEach(e => { const v = e.getAttribute('style'); if (/url\(|@import/i.test(v)) { const w = noUrl(v); if (w !== v) { e.setAttribute('style', w); n++; } } });
  $$('style', root).forEach(e => { const v = e.textContent, w = noUrl(v); if (w !== v) { e.textContent = w; n++; } });
  return n;
}
function load(text, name) {
  const d = new DOMParser().parseFromString(text, 'text/html'), m = d.querySelector('main') || d.body;
  const nv = d.querySelector('nav[data-depth]'); idxDepth = nv ? Math.min(3, Math.max(1, parseInt(nv.dataset.depth, 10) || 1)) : 1; setNotes(m.matches('main.notes-on'));
  $$('script,nav,link,meta', m).forEach(n => n.remove());
  $$('style,title', m).filter(n => !n.closest('svg')).forEach(n => n.remove());
  sanitize(m); remoteImgs = cardify(m); upgradeNotes(m); repSet(null); $('#cleanbar').hidden = true; $('#savedbar').hidden = true;
  $$('section', m).forEach(s => s.replaceWith(...s.childNodes));
  $$('h2', m).forEach(h => { const f = h.firstChild; if (f && f.nodeType === 3) f.nodeValue = f.nodeValue.replace(/^\s*\d+\.\s+/, ''); h.removeAttribute('id'); });
  deactivate(); doc.innerHTML = m.innerHTML.trim(); prep(); histReset(); fname = name || fname; dirty = false; status(); scrollTo(0, 0);
}
function download(html) { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([html], { type: 'text/html' })); a.download = fname; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const TYPES_HTML = [{ description: 'HTML document', accept: { 'text/html': ['.html', '.htm'] } }];
/* Open and Save dialogs share one name, so Chrome and Edge reopen them in the folder used last, across sessions.
   The browser keeps this in its own profile; nothing is written to the document or the project. While a document is
   open, the dialogs start in that document's folder. */
function pickerOpts(o) { o.id = 'fine-line-documents'; o.types = TYPES_HTML; if (handle) o.startIn = handle; delete o.noStart; return o; }
/* After a save, a line names the file. A page is told the file's name only, never its folder, so the name is all it can show. */
function savedLine(name, dl) { $('#savedmsg').textContent = (dl ? 'File saved to the browser\'s downloads folder: ' : 'File saved: ') + name; $('#savedbar').hidden = false; chromeHeight(); }
async function save(as) {
  let dl = false; deactivate(); const html = build();
  try {
    if (window.showSaveFilePicker) {
      if (!handle || as) handle = await showSaveFilePicker(pickerOpts({ suggestedName: fname }));
      const w = await handle.createWritable(); await w.write(html); await w.close(); fname = handle.name;
    } else { download(html); dl = true; }
  } catch (e) { if (e.name === 'AbortError') return; handle = null; download(html); dl = true; }
  dirty = false; status(); try { localStorage.removeItem('fle-draft'); } catch (e) { }
  savedLine(fname, dl);
  if (notesIn(doc)) { $('#cleanbar').hidden = false; chromeHeight(); }
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
  if (!keepGoing('open another document')) return;
  try {
    if (window.showOpenFilePicker) { const [h] = await showOpenFilePicker(pickerOpts({})); const f = await h.getFile(); handle = h; load(await f.text(), f.name); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  $('#file').click();
}
$('#file').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; handle = null; load(await f.text(), f.name); e.target.value = ''; });
function fresh() { if (!keepGoing('start a new document')) return; handle = null; fname = 'document.html'; idxDepth = 1; repSet(null); $('#cleanbar').hidden = true; $('#savedbar').hidden = true; setNotes(false); remoteImgs = 0; deactivate(); doc.innerHTML = STARTER; prep(); histReset(); dirty = false; status(); }

/* ---------- toolbar wiring ---------- */
const ACT = {
  new: fresh, open: open, save: () => save(false), saveas: () => save(true),
  bold: () => cmd('bold'), italic: () => cmd('italic'), ul: () => cmd('insertUnorderedList'), ol: () => cmd('insertOrderedList'),
  undo: () => histGo(-1), redo: () => histGo(1),
  code: addCode, clear: clearFormat, paint: () => { if (paint) paintStop(); else paintPick(false); }, note: addNote, margin: toggleNotes, who: () => initials(true), saveclean: saveClean, repeat: repeatLast, nosaved: () => { $('#savedbar').hidden = true; chromeHeight(); }, noclean: () => { $('#cleanbar').hidden = true; chromeHeight(); },
  link: editLink,
  tag: () => { restore(); const t = getSelection().toString() || 'ID'; document.execCommand('insertHTML', false, '<span class="id">' + esc(t) + '</span>&nbsp;'); touch(); },
  table: addTable, stage: addStage, mr: () => tableOp('mr'), md: () => tableOp('md'), split: () => tableOp('split'), qa: addQa, 'r+': () => tableOp('r+'), ra: () => tableOp('ra'), cl: () => tableOp('cl'), 'r-': () => tableOp('r-'), 'c+': () => tableOp('c+'), 'c-': () => tableOp('c-'), dense: () => tableOp('dense'),
  diagram: () => openDiagram(null), dgedit: () => dgSel && openDiagram(dgSel), dgdel: dgDelete, help: () => { const h = $('#help'); if (h.open) h.close(); else { helpInfo(); h.showModal(); } },
  connect: () => setMode(mode === 'connect' ? null : 'connect'), del: remove, dup: duplicate, deldiagram: deleteDiagram,
  restore: () => { try { const d = localStorage.getItem('fle-draft'); if (d) { const t = new DOMParser().parseFromString('<main>' + d + '</main>', 'text/html'); sanitize(t.querySelector('main')); cardify(t.querySelector('main')); doc.innerHTML = t.querySelector('main').innerHTML; prep(); histReset(); dirty = true; status(); } } catch (e) { } $('#draft').hidden = true; chromeHeight(); },
  dismiss: () => { try { localStorage.removeItem('fle-draft'); } catch (e) { } $('#draft').hidden = true; chromeHeight(); },
};
$('#chrome').addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
$('#chrome').addEventListener('click', e => { const b = e.target.closest('button[data-a]'); if (!b) return; const a = b.dataset.a; if (!board && !['undo', 'redo', 'help', 'new', 'open', 'save', 'saveas', 'who', 'saveclean', 'noclean', 'nosaved', 'margin', 'paint', 'repeat'].includes(a)) { clearTimeout(timer); histSnap(); } if (ACT[a]) { ACT[a](); if (!board) repNote(a); } else if (ADD[a] && board) ADD[a](); });
$('#help').addEventListener('click', e => { if (e.target === e.currentTarget || e.target.closest('[data-a="helpclose"]')) e.currentTarget.close(); });
$('#s-block').addEventListener('change', e => { const v = e.target.value; if (v) { const label = e.target.selectedOptions[0].textContent; clearTimeout(timer); histSnap(); setBlock(v); repSet(label, () => setBlock(v)); } styleUI(); });
$('#s-index').addEventListener('change', e => { idxDepth = +e.target.value || 1; rebuild(); touch(); });
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

/* ---------- start ---------- */
doc.innerHTML = STARTER; prep(); histReset(); status(); whoUI(); chromeHeight(); $$('#tbar button.t').forEach(x => x.classList.add('dim'));
try { const d = localStorage.getItem('fle-draft'); if (d && d !== clean().innerHTML) $('#draft').hidden = false; } catch (e) { }
chromeHeight();
window.FLE = { load, build, ADD, activate, connect, select, newDiagram, DE, boardToDrawio, get board() { return board; } };
})();
