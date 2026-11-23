/* ---------- notebook explorer ----------
   A folder on disk shown as a notebook: folders are sections, files are pages. The folder is reached through the
   browser's File System Access API (Chrome and Edge). Where that is missing the tree is read-only and saving downloads.
   A node is { name, kind, handle, parent, kids, open }; kids is null until the folder has been read. */
const NB = (() => {
  const panel = $('#nb'), tree = $('#nb-tree'), land = $('#nb-land'), msgEl = $('#nb-msg'), menu = $('#nb-menu');
  const canWrite = 'showDirectoryPicker' in window;
  const PINNED = ['_templates', '.history', '.trash'];            // root folders pinned to the bottom, in this order
  const PROTECTED = ['_templates', '.history', '.trash', '.notebook']; // root folders that cannot be renamed, moved or deleted
  const KEEP = ['.history', '.trash'];                             // stay listed when hidden files are off
  let root = null, ro = false, cur = null, sel = null, renaming = null, flat = [], remembered = null, dragged = null;
  let sort = { by: 'name', desc: false }, folderSort = {}, favs = [], favOpen = true, favGone = new Set();
  let showHidden = true, lastScan = 0, msgTimer = null, queue = Promise.resolve();

  const ic = n => $('#nb-ic').content.querySelector('[data-ic="' + n + '"]').innerHTML;
  const lower = s => s.toLowerCase();
  const isPage = n => n.kind === 'file' && /\.html?$/i.test(n.name);
  /* Other kinds of file have editors of their own (src/editors/) and are saved as themselves: Markdown in the WYSIWYG
     editor with its Markdown profile, text and code in the text editor. The notebook finds the files, chooses the
     editor by the file's name, and does the reading, writing, history and prompts for all of them. */
  const isMd = n => n.kind === 'file' && /\.(md|markdown)$/i.test(n.name);
  const isTxt = n => n.kind === 'file' && !isPage(n) && !isMd(n) && !!TXT.typeOf(n.name);
  const isText = n => isMd(n) || isTxt(n);
  const opens = n => isPage(n) || isText(n);
  const kindOf = n => isPage(n) ? 'page' : isMd(n) ? 'md' : 'text';
  const extName = n => { const m = n.name.match(/\.[A-Za-z0-9]+$/); return isPage(n) ? '.html' : m ? m[0] : '.txt'; };
  let kind = 'page', openSeq = 0;   // which editor is in front: 'page', 'md' (the page editor with the Markdown profile) or 'text'
  function setKind(k, info) {
    kind = k; if (k !== 'md') mdUrlsFree(); if (k !== 'page' && showBlocks) blocksSet(false);   // Show blocks is for pages; its button is off in the other editors
    MD.profile(k === 'md'); document.documentElement.classList.toggle('tx-mode', k === 'text'); $('#tx').hidden = k !== 'text'; if (k !== 'text') TXT.close();
    $('#xbar').hidden = k === 'page'; if (k === 'page') $('[data-a="xsrc"]').hidden = true;
    if (k === 'md') { $('#x-kind').textContent = 'Markdown'; $('#x-name').textContent = info.name; $('#x-info').textContent = info.text; $('[data-a="xwrap"]').hidden = true; $('[data-a="xfind"]').hidden = true; }
    $('#xbar .sep').hidden = k !== 'text'; repSet(null); chromeHeight(); fit();
  }
  const mdInfo = enc => [enc.kind === 'utf-8' ? 'UTF-8' + (enc.bom ? ' with BOM' : '') : enc.kind.toUpperCase(), enc.eol === '\r\n' ? 'CRLF' : enc.eol === '\r' ? 'CR' : 'LF', 'Saved as Markdown. Things Markdown cannot hold are switched off on the toolbar.'].join(' | ');
  const MD_SOURCE = { id: 'markdown', name: 'Markdown source' };
  /* The Source button shows for a Markdown file, in either view; it is lit while the source is shown. */
  function srcUI() {
    const b = $('[data-a="xsrc"]'), md = !!(cur && cur.md); b.hidden = !md; b.classList.toggle('on', md && cur.kind === 'text'); b.setAttribute('aria-pressed', String(md && cur.kind === 'text'));
    if (md) b.title = cur.kind === 'text' ? 'Show this Markdown file formatted again. Unsaved changes go with it' : 'Show the Markdown source of this file as text. Unsaved changes go with it';
    if (md) $('#xbar .sep').hidden = false; chromeHeight();
  }
  /* Switch a Markdown file between the formatted view and its source, keeping unsaved changes. Both are the same file:
     Save writes Markdown from whichever view is in front. Each view has its own undo, which starts afresh at the switch. */
  async function mdSwitch() {
    if (!cur || !cur.md) return;
    const was = dirty;
    if (cur.kind === 'md') {
      let text = cur.disk;
      if (dirty) {   // the source is written from the formatted view; unchanged, the file's own text is shown as it is on disk
        deactivate(); rebuild(); const c = clean(), lost = MD.lost(c, cur.meta);
        if (lost.length && !confirm('The Markdown source cannot keep everything shown in "' + cur.name + '":\n\n' + lost.map(x => '  ' + x).join('\n') + '\n\nOK: show the source without them.\nCancel: stay in this view.')) return;
        text = MD.write(c, cur.meta);
      }
      const why = TXT.openText(cur.name, text, cur.enc, { as: MD_SOURCE, changed: () => { if (!dirty) { dirty = true; status(); } } });
      if (why) { say('Could not show the source: ' + why + '.', true); return; }
      blank(); setKind('text'); fname = cur.name; cur.kind = 'text'; TXT.focus();
    } else {
      if (TXT.readOnly()) { say('"' + cur.name + '" is read-only here, so it can only be shown as its source.', true); return; }
      const text = TXT.content(); cur.meta = MD.read(text); cur.warned = false;
      setKind('md', { name: cur.name, text: mdInfo(cur.enc) });
      handle = null; load('<main>' + await mdPictures(cur.meta.html, cur.dir) + '</main>', cur.name, { asTyped: true }); cur.kind = 'md';
    }
    dirty = was; status(); srcUI(); render();
  }
  /* What Save would write for the open file, as text with \n line breaks (a page: its HTML). */
  function curText() { if (cur.kind === 'text') return TXT.content(); if (cur.kind === 'md') { rebuild(); return MD.write(clean(), cur.meta); } return build(); }
  const sameBytes = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  const label = n => n.name;   // the tree shows every file by its full name, extension included
  const find = (dir, name) => (dir.kids || []).find(k => lower(k.name) === lower(name));
  const pathArr = n => { const p = []; for (; n && n.parent; n = n.parent) p.unshift(n.name); return p; };
  const within = (n, anc) => { for (; n; n = n.parent) if (n === anc) return true; return false; };
  const isProtected = n => n.parent === root && PROTECTED.includes(n.name);
  const trashNode = () => root && find(root, '.trash');
  const inTrash = n => { const t = trashNode(); return !!t && n !== t && within(n, t); };
  const attached = n => { for (; n.parent; n = n.parent) if (!(n.parent.kids || []).includes(n)) return false; return n === root; };
  const badName = v => !v ? 'Enter a name.' : /[\\/:*?"<>|\u0000-\u001f]/.test(v) ? 'A name cannot contain \\ / : * ? " < > |' : (/^\.+$/.test(v) || /[. ]$/.test(v)) ? 'A name cannot end with a dot or a space.' : '';
  const fileName = t => t.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|[. ]+$/g, '').slice(0, 120) || 'Untitled';
  const isOwn = text => /<meta name="generator" content="fine-line-editor( [^"]*)?">/.test(text.slice(0, 4000)) || (/<nav aria-label="Index"/.test(text) && /<div class="page">/.test(text));
  function stamp(name) { const d = new Date(), p = n => String(n).padStart(2, '0'), s = ' (' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes()) + '.' + p(d.getSeconds()) + ')'; const i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) + s + name.slice(i) : name + s; }
  function say(text, bad) { clearTimeout(msgTimer); msgEl.textContent = text || ''; msgEl.classList.toggle('bad', !!bad); if (text && !bad) msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 6000); }

  /* ----- remembered folder: the handle is kept in the browser's own storage, never in a document ----- */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('fine-line-notebook', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const kv = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = () => { db.close(); rej(t.error); }; }); };

  /* ----- reading and writing ----- */
  async function readDir(n) {
    const old = n.kids || [], kids = [];
    for await (const h of n.handle.values()) { const o = old.find(k => k.name === h.name && k.kind === h.kind); kids.push(o ? Object.assign(o, { handle: h }) : { name: h.name, kind: h.kind, handle: h, parent: n, kids: null, open: false }); }
    n.kids = kids; n.statAt = 0; return kids;
  }
  /* One write at a time, tried up to three times, and read back to confirm what is on disk. */
  function write(h, text) {
    const job = queue.then(async () => {
      let err;
      for (let i = 0; i < 3; i++) {
        try { const w = await h.createWritable(); await w.write(text); await w.close(); const f = await h.getFile(); if (typeof text === 'string' ? await f.text() === text : sameBytes(new Uint8Array(await f.arrayBuffer()), new Uint8Array(await text.arrayBuffer()))) return; err = new Error('the file read back differently from what was written'); } catch (e) { err = e; }
        await new Promise(r => setTimeout(r, 250 * (i + 1)));
      }
      throw err;
    });
    queue = job.catch(() => { }); return job;
  }
  async function nodeAt(arr, create) {
    let n = root;
    for (const s of arr) { if (!n.kids) await readDir(n); let k = find(n, s); if (!k && create) { await n.handle.getDirectoryHandle(s, { create: true }); await readDir(n); k = find(n, s); } if (!k) return null; n = k; }
    return n;
  }
  async function copyDir(a, b) {
    for await (const h of a.values()) {
      if (h.kind === 'file') { const w = await (await b.getFileHandle(h.name, { create: true })).createWritable(); await w.write(await h.getFile()); await w.close(); }
      else await copyDir(h, await b.getDirectoryHandle(h.name, { create: true }));
    }
  }
  /* Move or rename on disk. The browser's own move is used where it works; otherwise the item is copied, then removed. */
  async function moveEntry(n, dest, name) {
    if (n.handle.move) { try { await (dest === n.parent ? n.handle.move(name) : n.handle.move(dest.handle, name)); return; } catch (e) { if (n.kind === 'file' && e.name !== 'TypeError' && e.name !== 'NotSupportedError' && e.name !== 'InvalidStateError') throw e; } }
    if (n.kind === 'file') { const w = await (await dest.handle.getFileHandle(name, { create: true })).createWritable(); await w.write(await n.handle.getFile()); await w.close(); await n.parent.handle.removeEntry(n.name); }
    else { await copyDir(n.handle, await dest.handle.getDirectoryHandle(name, { create: true })); await n.parent.handle.removeEntry(n.name, { recursive: true }); }
  }
  /* Move a node and keep the open page pointing at its file when the page, or a folder above it, is what moved. */
  async function relocate(n, dest, name) {
    const from = n.parent, wasOpen = n.open, oldRel = pathArr(n), curRel = cur && cur.node && within(cur.node, n) ? pathArr(cur.node).slice(pathArr(n).length) : null;
    await moveEntry(n, dest, name);
    await readDir(from); if (dest !== from) await readDir(dest);
    const moved = find(dest, name); if (!moved) return null;
    await moveHistory(oldRel, pathArr(moved));
    if (repath(oldRel, pathArr(moved))) saveSettings();
    if (wasOpen && moved.kind === 'directory') { moved.open = true; await readDir(moved); }
    if (curRel) { const c = await nodeAt([...pathArr(moved), ...curRel]); if (c) { cur.node = c; cur.dir = c.parent; cur.name = c.name; if (cur.kind === 'page') handle = c.handle; else { $('#x-name').textContent = c.name; TXT.rename(c.name); } fname = c.name; try { cur.mtime = (await c.handle.getFile()).lastModified; } catch (e) { } status(); } }
    return moved;
  }

  /* ----- settings: .notebook/settings.json in the notebook; missing or damaged settings fall back to defaults ----- */
  async function loadSettings() {
    showHidden = true; cfg = { ...CFG }; sort = { by: 'name', desc: false }; folderSort = {}; favs = []; favOpen = true; favGone = new Set();
    try {
      const d = await root.handle.getDirectoryHandle('.notebook'), f = await (await d.getFileHandle('settings.json')).getFile(), s = JSON.parse(await f.text()) || {};
      if (typeof s.showHidden === 'boolean') showHidden = s.showHidden; for (const k of Object.keys(CFG)) if (typeof s[k] === 'number' && s[k] > 0) cfg[k] = s[k];
      const good = v => v && SORTS[v.by] ? { by: v.by, desc: !!v.desc } : null; sort = good(s.sort) || sort;
      if (s.folderSort && typeof s.folderSort === 'object') for (const [k, v] of Object.entries(s.folderSort)) { const o = good(v); if (o && k) folderSort[k] = o; }
      if (Array.isArray(s.favourites)) favs = [...new Set(s.favourites.filter(p => p && typeof p === 'string'))];
      if (typeof s.favouritesOpen === 'boolean') favOpen = s.favouritesOpen;
    } catch (e) { }
  }
  async function saveSettings() {
    if (ro || !root) return;
    try {
      const d = await root.handle.getDirectoryHandle('.notebook', { create: true }), fh = await d.getFileHandle('settings.json', { create: true });
      let s = {}; try { s = JSON.parse(await (await fh.getFile()).text()) || {}; } catch (e) { }
      s.showHidden = showHidden; s.sort = sort; s.folderSort = folderSort; s.favourites = favs; s.favouritesOpen = favOpen; await write(fh, JSON.stringify(s, null, 2) + '\n');
    } catch (e) { say('Could not save the notebook settings: ' + e.message, true); }
  }

  /* ----- sorting and favourites: kept in the notebook's settings -----
     One sort for the whole notebook. A folder can be given its own; setting the notebook sort again clears those.
     Folders always come first. Modified date and size are read from the files only when a sort needs them.
     Favourites are pages, held as paths within the notebook and listed above the tree. */
  const SORTS = { name: 'Name', modified: 'Modified date', size: 'Size', type: 'Type' }, TICK = '\u2713 ';
  const key = n => pathArr(n).join('/');
  const sortOf = dir => (dir !== root && folderSort[key(dir)]) || sort;
  const needsStat = dir => { const b = sortOf(dir).by; return b === 'modified' || b === 'size'; };
  const ext = n => { const i = n.name.lastIndexOf('.'); return i > 0 ? lower(n.name.slice(i + 1)) : ''; };
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
  function order(dir) {
    const s = sortOf(dir), sign = s.desc ? -1 : 1, num = { modified: n => n.meta ? n.meta.mtime : 0, size: n => n.meta ? n.meta.size : 0 }[s.by];
    return (a, b) => {
      if (a.kind !== b.kind) return a.kind === 'directory' ? -1 : 1;
      if (s.by === 'name') return sign * byName(a, b);
      if (a.kind === 'directory') return byName(a, b);   // a folder has no date, size or type of its own
      return sign * (num ? num(a) - num(b) : ext(a).localeCompare(ext(b))) || byName(a, b);
    };
  }
  async function stat(dir) {
    dir.statAt = Date.now();
    await Promise.all(dir.kids.filter(k => k.kind === 'file').map(async k => { try { const f = await k.handle.getFile(); k.meta = { mtime: f.lastModified, size: f.size }; } catch (e) { k.meta = k.meta || { mtime: 0, size: 0 }; } }));
  }
  function sortMenu(dir, x, y) {
    const s = dir ? sortOf(dir) : sort, own = !!(dir && folderSort[key(dir)]);
    const set = ch => {
      const v = { ...s, ...ch };
      if (dir) folderSort[key(dir)] = v;
      else { const had = Object.keys(folderSort).length; sort = v; folderSort = {}; say(had ? 'The whole notebook is sorted this way now, including the ' + (had === 1 ? 'folder that had its own sort.' : had + ' folders that had their own sort.') : ''); }
      saveSettings(); render();
    };
    const m = Object.entries(SORTS).map(([k, l]) => [(s.by === k ? TICK : '') + l, () => set({ by: k })]);
    m.push(null, [(s.desc ? '' : TICK) + 'Ascending', () => set({ desc: false })], [(s.desc ? TICK : '') + 'Descending', () => set({ desc: true })]);
    if (own) m.push(null, ['Use the notebook sort', () => { delete folderSort[key(dir)]; saveSettings(); render(); }]);
    drawMenu(m, x, y);
  }
  const canFav = n => !ro && isPage(n) && !inTrash(n) && !within(n, find(root, '.history'));
  const isFav = n => favs.includes(key(n));
  function dropFav(p) { favs = favs.filter(x => x !== p); favGone.delete(p); saveSettings(); render(); }
  function toggleFav(n) { const p = key(n); if (favs.includes(p)) dropFav(p); else { favs.push(p); favGone.delete(p); saveSettings(); render(); } }
  async function openFav(p) {
    let n = null; try { n = await nodeAt(p.split('/')); } catch (e) { }
    if (!n || !isPage(n)) { favGone.add(p); render(); say('"' + p + '" is no longer in the notebook. Click its star to take it out of favourites.', true); return; }
    favGone.delete(p); for (let d = n.parent; d && d !== root; d = d.parent) d.open = true;
    await openPage(n);
  }
  /* A favourite whose page has gone (renamed, moved or deleted outside the editor) stays listed, greyed. */
  async function checkFavs() {
    const r = root, gone = new Set();
    for (const p of favs) { let n = null; try { n = await nodeAt(p.split('/')); } catch (e) { } if (r !== root) return; if (!n || !isPage(n)) gone.add(p); }
    if (gone.size !== favGone.size || [...gone].some(p => !favGone.has(p))) { favGone = gone; if (!renaming) render(); }
  }
  /* A page or folder moved or renamed here takes its favourites and folder sorts with it; one sent to the trash loses them. */
  function repath(a, b) {
    a = a.join('/'); b = b.join('/'); let ch = false; const fix = p => p === a ? b : p.startsWith(a + '/') ? b + p.slice(a.length) : p;
    favs = favs.map(p => { const q = fix(p); if (q !== p) ch = true; return q; });
    for (const k of Object.keys(folderSort)) { const q = fix(k); if (q !== k) { folderSort[q] = folderSort[k]; delete folderSort[k]; ch = true; } }
    return ch;
  }
  function unpath(a) {
    a = a.join('/'); const hit = p => p === a || p.startsWith(a + '/'), n = favs.length + Object.keys(folderSort).length;
    favs = favs.filter(p => !hit(p)); for (const k of Object.keys(folderSort)) if (hit(k)) delete folderSort[k];
    return n !== favs.length + Object.keys(folderSort).length;
  }
  function favUI() {
    const box = $('#nb-fav'); box.textContent = ''; box.hidden = !root || !favs.length; if (box.hidden) return;
    const h = document.createElement('div'); h.className = 'nb-fav-h'; h.setAttribute('role', 'button'); h.tabIndex = 0; h.setAttribute('aria-expanded', favOpen ? 'true' : 'false');
    h.innerHTML = '<span class="nb-caret">' + ic(favOpen ? 'caret-down' : 'caret-right') + '</span>' + ic('star-fill') + '<span>Favourites</span>'; box.appendChild(h);
    if (!favOpen) return; const at = cur && cur.node ? key(cur.node) : null;
    favs.forEach((p, i) => {
      const r = document.createElement('div'), gone = favGone.has(p);
      r.className = 'nb-frow' + (gone ? ' is-gone' : '') + (p === at ? ' is-cur' : ''); r.dataset.f = i; r.title = p + (gone ? ' (not found)' : '');
      r.innerHTML = ic('file-text') + '<span class="nb-lbl"></span><span class="nb-star on" role="button" aria-label="Remove from favourites" title="Remove from favourites">' + ic('star-fill') + '</span>';
      r.children[1].textContent = p.slice(p.lastIndexOf('/') + 1); box.appendChild(r);
    });
  }

  /* ----- the tree ----- */
  function visible(n) {
    const all = (n.kids || []).filter(k => showHidden || k.name[0] !== '.' || (n === root && KEEP.includes(k.name)));
    const pin = k => n === root && k.kind === 'directory' ? PINNED.indexOf(k.name) : -1;
    const by = order(n);
    if (needsStat(n) && !n.statAt) stat(n).then(() => { if (root && !renaming) render(); });
    return [...all.filter(k => pin(k) < 0).sort(by), ...all.filter(k => pin(k) >= 0).sort((a, b) => pin(a) - pin(b))];
  }
  function row(n, depth, fresh) {
    const r = document.createElement('div'), dir = !fresh && n.kind === 'directory', page = fresh || opens(n);
    r.className = 'nb-row ' + (fresh ? 'k-page is-new is-cur' : (dir ? 'k-dir' : page ? 'k-page' : 'k-other') + (n === sel ? ' is-sel' : '') + (cur && cur.node === n ? ' is-cur' : '') + (isProtected(n) ? ' is-pin' : ''));
    r.setAttribute('role', 'treeitem'); r.style.paddingLeft = (6 + depth * 14) + 'px';
    if (dir) r.setAttribute('aria-expanded', n.open ? 'true' : 'false');
    r.innerHTML = '<span class="nb-caret">' + (dir ? ic(n.open ? 'caret-down' : 'caret-right') : '') + '</span>' + ic(dir ? (n.open ? 'folder-open' : 'folder') : page ? 'file-text' : 'file') + '<span class="nb-lbl"></span>';
    if (fresh) { r.lastChild.textContent = 'New page (not saved)'; r.title = 'Saved here the first time you press Save; named after its title'; return r; }
    r.dataset.i = flat.push(n) - 1; r.title = pathArr(n).join('/');
    if (n === renaming) {
      const ext = isPage(n) ? n.name.match(/\.html?$/i)[0] : '', inp = document.createElement('input');
      inp.type = 'text'; inp.value = n.name.slice(0, n.name.length - ext.length); inp.spellcheck = false; inp.setAttribute('aria-label', 'New name'); r.lastChild.replaceWith(inp);
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); { const v = inp.value.trim(); commitRename(n, ext && /\.html?$/i.test(v) ? v : v + ext, inp); } } else if (e.key === 'Escape') { e.preventDefault(); endRename(); } });
      inp.addEventListener('blur', () => { if (renaming === n) { renaming = null; render(); } });
      ['click', 'mousedown', 'dblclick', 'contextmenu'].forEach(t => inp.addEventListener(t, e => e.stopPropagation()));
    } else {
      r.lastChild.textContent = label(n); if (!ro && !isProtected(n)) r.draggable = true;
      if (canFav(n)) { const f = isFav(n), t = f ? 'Remove from favourites' : 'Add to favourites'; r.insertAdjacentHTML('beforeend', '<span class="nb-star' + (f ? ' on' : '') + '" role="button" aria-label="' + t + '" title="' + t + '">' + ic(f ? 'star-fill' : 'star') + '</span>'); }
    }
    return r;
  }
  function render() {
    const on = !!root; land.hidden = on; tree.hidden = !on; $('#nb-name').textContent = on ? root.name + (ro ? ' (read-only)' : '') : 'Notebook';
    $$('.nb-top button', panel).forEach(b => { const a = b.dataset.nb; b.hidden = a === 'hide' ? false : a === 'pick' ? !on : !on || (ro && a !== 'hidden' && a !== 'newpage' && a !== 'sort'); });
    const hb = $('[data-nb="hidden"]', panel); hb.setAttribute('aria-pressed', showHidden ? 'true' : 'false'); hb.classList.toggle('on', showHidden);
    tree.textContent = ''; flat = []; statusUI(); recUI(); favUI();
    if (!on) { landUI(); return; }
    const pend = cur && !cur.node ? cur.dir : null;
    if (pend === root) tree.appendChild(row(null, 0, true));
    const add = (n, depth) => { for (const k of visible(n)) { tree.appendChild(row(k, depth)); if (k.kind === 'directory' && k.open && k.kids) { if (pend === k) tree.appendChild(row(null, depth + 1, true)); add(k, depth + 1); } } };
    add(root, 0);
    const inp = $('input', tree); if (inp) { inp.focus(); inp.select(); }
  }
  function landUI() {
    const t = $('#nb-land-t'), rc = $('[data-nb="reconnect"]', land), pk = $('[data-nb="pick"]', land);
    rc.hidden = !remembered; if (remembered) rc.textContent = 'Reconnect "' + remembered.name + '"';
    if (canWrite) { t.textContent = 'A notebook is a folder on this computer: its folders are sections and its files are pages. Choose the folder and allow the browser to edit files in it. Pages are saved straight into the folder.'; pk.textContent = remembered ? 'Choose another folder' : 'Choose notebook folder'; }
    else { t.textContent = 'This browser can show a notebook folder but cannot save into it. The explorer is read-only here, and new or changed pages are saved to the downloads folder for you to move. Chrome and Edge can save straight into the folder.'; pk.textContent = 'Choose folder (read-only)'; }
  }
  async function refresh() {
    if (!root) return render();
    lastScan = Date.now();
    if (!ro) {
      const walk = async n => { await readDir(n); for (const k of n.kids) if (k.kind === 'directory' && k.kids) await walk(k).catch(() => { }); };
      try { await walk(root); } catch (e) { say('The notebook folder could not be read: ' + e.message, true); return; }
      if (cur && cur.node && !attached(cur.node)) { cur.node = null; handle = null; dirty = true; status(); say('The open page was moved, renamed or deleted outside the editor. Press Save to keep it in this folder.', true); }
      if (cur && cur.dir && !attached(cur.dir)) cur.dir = root;
      if (sel && !attached(sel)) sel = null;
    }
    render(); checkFavs();
  }

  /* ----- prompts ----- */
  function dlg(d, ready) {
    return new Promise(res => {
      const done = v => { d.removeEventListener('click', onClick); d.removeEventListener('cancel', onCancel); d.close(); res(v); };
      const onClick = e => { const b = e.target.closest('button[value]'); if (b) done(b.value); }, onCancel = e => { e.preventDefault(); done('cancel'); };
      d.addEventListener('click', onClick); d.addEventListener('cancel', onCancel); d.showModal(); if (ready) ready();
    });
  }
  /* Leaving a page with unsaved changes: Save, Discard or Cancel. True when it is safe to go on. */
  async function leave() {
    if (!dirty) return true;
    $('#nb-ask-t').textContent = '"' + pageTitle() + '" has unsaved changes.';
    const a = await dlg($('#nb-ask'));
    if (a === 'cancel') return false;
    if (a === 'save') { await save(false); return !dirty; }
    return true;
  }
  const pageTitle = () => { if (cur && cur.kind && cur.kind !== 'page') return cur.name; const h = $('h1', doc), t = h ? h.textContent.trim() : ''; return t || (cur && cur.node ? label(cur.node) : 'This page'); };
  async function clash(dir, name) {
    const inp = $('#nb-clash-n'), err = $('#nb-clash-e'), stem = name.replace(/\.html$/i, ''); let n = 2; while (find(dir, stem + ' ' + n + '.html')) n++;
    $('#nb-clash-t').textContent = 'A page named "' + stem + '" is already in this folder.'; inp.value = stem + ' ' + n; err.textContent = '';
    for (; ;) {
      const a = await dlg($('#nb-clash'), () => { inp.focus(); inp.select(); });
      if (a === 'cancel') return null;
      if (a === 'replace') return find(dir, name).name;
      const v = inp.value.trim(), bad = badName(v);
      if (bad) { err.textContent = bad; continue; }
      if (find(dir, v + '.html')) { err.textContent = 'That name is also used in this folder.'; continue; }
      return v + '.html';
    }
  }

  /* ----- pages and other files ----- */
  /* as: open with this editor in place of the one the name gives ('text' shows a Markdown file as its source). */
  async function openPage(n, as) {
    if (cur && cur.node === n && cur.md && as === 'text') { if (cur.kind !== 'text') mdSwitch(); sel = n; render(); return; }   // Open as text on the Markdown file already open
    const want = as || kindOf(n);
    if (cur && cur.node === n && ((cur.kind || 'page') === want || (cur.md && !as))) { sel = n; render(); return; }
    if (!(await leave())) return;
    /* Files are read with awaits. If another file is clicked meanwhile, the later click wins: an earlier open that finishes
       late stops before it changes anything, so what is shown and what is saved are always the same file. */
    const my = ++openSeq;
    rec = null;
    if (want !== 'page') return openOther(n, want, my);
    let text, mtime;
    try { const f = await n.handle.getFile(); text = await f.text(); mtime = f.lastModified; } catch (e) { if (my === openSeq) say('Could not open ' + n.name + ': ' + e.message, true); return; }
    const other = isOwn(text) ? null : await withPictures(text);
    if (my !== openSeq) return;
    sel = n; setKind('page');
    if (isOwn(text)) { handle = ro ? null : n.handle; load(text, n.name); cur = { dir: n.parent, node: n, kind: 'page', name: n.name, mtime, disk: text }; say(''); if (!ro && !inTrash(n)) await checkRecover(n, text, mtime); }
    else { handle = ro ? null : n.handle; load(other, n.name); cur = { dir: n.parent, node: n, kind: 'page', name: n.name, mtime, disk: text }; say(n.name + ' was not made in Fine Line. Save writes it in the Fine Line page format under its own name; the file as it is now is kept in its history first.'); }
    render();
  }
  /* A Markdown, text or code file: it stays the file it is. The bytes are read so that its encoding and line endings can be kept. */
  async function openOther(n, want, my) {
    let buf, mtime;
    try { const f = await n.handle.getFile(); buf = await f.arrayBuffer(); mtime = f.lastModified; } catch (e) { if (my === openSeq) say('Could not open ' + n.name + ': ' + e.message, true); return; }
    if (my !== openSeq) return;
    let d = null;
    if (want === 'md') { d = TXT.decode(buf); if (d.error) want = 'text'; }   // Markdown that is not readable text is shown, read-only, by the text editor
    if (want === 'md') {
      const meta = MD.read(d.text), html = await mdPictures(meta.html, n.parent, my);
      if (my !== openSeq) return;
      setKind('md', { name: n.name, text: mdInfo(d.enc) });
      handle = null; load('<main>' + html + '</main>', n.name, { asTyped: true });
      cur = { dir: n.parent, node: n, kind: 'md', md: true, name: n.name, mtime, disk: d.text, enc: d.enc, meta };
    } else {
      const why = TXT.open(n.name, buf, { as: isMd(n) ? MD_SOURCE : null, changed: () => { if (!dirty) { dirty = true; status(); } } });
      if (why) { say('Could not open ' + n.name + ': ' + why + '.', true); return; }
      blank(); setKind('text'); fname = n.name; status();
      cur = { dir: n.parent, node: n, kind: 'text', md: isMd(n), name: n.name, mtime, disk: TXT.content(), enc: TXT.decode(buf).enc || null };
      TXT.focus();
    }
    sel = n; say(''); srcUI(); if (!ro && !inTrash(n) && !(cur.kind === 'text' && TXT.readOnly())) await checkRecover(n, cur.disk, mtime);
    render();
  }
  /* Pictures in a Markdown file that point to files in the notebook (![](img/pic.png), ../shared/x.svg) are shown: each is
     read from the notebook folder and shown from a blob: address; data-md-src keeps the path, which is what is saved.
     Pictures on the web, or not found, stay link cards as before. The addresses are let go when another file opens. */
  let mdUrls = [];
  function mdUrlsFree() { mdUrls.forEach(u => URL.revokeObjectURL(u)); mdUrls = []; }
  async function fileAt(dir, rel) {
    let p = rel.split(/[?#]/)[0]; try { p = decodeURIComponent(p); } catch (e) { }
    if (!p || /^[a-z][a-z0-9+.-]*:/i.test(p) || p.startsWith('/') || p.startsWith('\\')) return null;
    const parts = pathArr(dir); for (const s of p.replace(/\\/g, '/').split('/')) { if (!s || s === '.') continue; if (s === '..') { if (!parts.length) return null; parts.pop(); } else parts.push(s); }
    try { let h = root.handle; for (const s of parts.slice(0, -1)) h = await h.getDirectoryHandle(s); return await (await h.getFileHandle(parts[parts.length - 1])).getFile(); } catch (e) { return null; }
  }
  async function mdPictures(html, dir, my) {
    if (!/<img/i.test(html)) { mdUrlsFree(); return html; }
    const mine = [];
    const t = document.createElement('template'); t.innerHTML = html;
    for (const i of $$('img', t.content)) { const src = i.getAttribute('data-md-src') || i.getAttribute('src') || '', f = src && await fileAt(dir, src); if (!f || !/^image\//.test(f.type || 'image/') && !/\.(png|jpe?g|gif|webp|svg|bmp|ico|avif)$/i.test(f.name)) continue; const u = URL.createObjectURL(f.type ? f : new Blob([f], { type: 'image/' + f.name.split('.').pop().replace('jpg', 'jpeg').replace('svg', 'svg+xml') })); mine.push(u); i.setAttribute('data-md-src', src); i.setAttribute('src', u); }
    if (my !== undefined && my !== openSeq) { mine.forEach(u => URL.revokeObjectURL(u)); return t.innerHTML; }
    mdUrlsFree(); mdUrls = mine; return t.innerHTML;
  }
  function downloadAs(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
  /* Save a Markdown, text or code file as itself: the same name, encoding and line endings. as: write a copy somewhere else. */
  async function saveOther(as) {
    if (cur.kind === 'text' && TXT.readOnly()) { say('"' + cur.name + '" is read-only here: ' + TXT.info().ro + '.', true); return; }
    let text;
    if (cur.kind === 'md') {
      deactivate(); rebuild(); const c = clean(), lost = MD.lost(c, cur.meta);
      if (lost.length && !cur.warned && !confirm('Markdown cannot keep everything in "' + cur.name + '":\n\n' + lost.map(x => '  ' + x).join('\n') + '\n\nOK: save as Markdown anyway.\nCancel: do not save.')) return;
      cur.warned = lost.length > 0; text = MD.write(c, cur.meta);
    } else text = TXT.content();
    const data = TXT.encode(text, cur.enc), done = (name, dl) => { dirty = false; status(); try { localStorage.removeItem(PRODUCT.key + '-draft'); } catch (e) { } $('#cleanbar').hidden = true; savedLine(name, dl); };
    try {
      if (as) {
        if (!window.showSaveFilePicker) { downloadAs(data, cur.name); savedLine(cur.name, true); return; }
        let h; try { h = await showSaveFilePicker({ id: 'fine-line-documents', suggestedName: cur.name }); } catch (e) { if (e.name === 'AbortError') return; throw e; }
        await write(h, data); $('#savedmsg').removeAttribute('title'); $('#savedmsg').textContent = 'A copy was saved: ' + h.name + '. The file open here is still ' + cur.name + '.'; $('#savedbar').hidden = false; chromeHeight(); return;
      }
      if (ro) { downloadAs(data, cur.name); done(cur.name, true); return; }
      if (cur.node) {
        let changed = false, old = null, oldTime = 0; let raw = null; try { const f = await cur.node.handle.getFile(); raw = await f.arrayBuffer(); const d = TXT.decode(raw); old = d.error ? null : d.text; oldTime = f.lastModified; changed = !!cur.mtime && oldTime !== cur.mtime && old !== cur.disk; } catch (e) { }
        if (changed && !confirm('"' + cur.name + '" has changed on disk since it was opened here.\n\nOK: save and replace what is on disk.\nCancel: do not save.')) return;
        await write(cur.node.handle, data);
        if (old !== null && old !== text && !inTrash(cur.node)) { try { await addSnap(cur.node, new Blob([raw]), oldTime, false); }   // the copy is the file's own bytes: encoding and line endings as they were
 catch (e) { say('The file was saved, but its earlier version could not be copied to history: ' + e.message, true); } }
      } else {   // its file went away outside the editor: it is written again, under its own name
        const dir = attached(cur.dir) ? cur.dir : root; await readDir(dir);
        if (find(dir, cur.name) && !confirm('"' + cur.name + '" is already in this folder.\n\nOK: replace it.\nCancel: do not save.')) return;
        await write(await dir.handle.getFileHandle(cur.name, { create: true }), data);
        await readDir(dir); cur.dir = dir; cur.node = find(dir, cur.name); dir.open = true;
      }
      sel = cur.node; cur.mtime = (await cur.node.handle.getFile()).lastModified; cur.disk = text; cur.node.meta = { mtime: cur.mtime, size: data.size }; cur.snap = undefined; rec = null;
      done(cur.node.name, false); if (!msgEl.classList.contains('bad')) say(''); render();
    } catch (e) { say('Could not save ' + cur.name + ': ' + e.message, true); }
  }
  /* Save the open page into the notebook. A page that has no file yet is named after its first H1. */
  async function savePage(as) {
    if (cur.kind && cur.kind !== 'page') return saveOther(as);
    deactivate();
    /* A new page with no H1 is named Untitled and the first number free in its folder; the saved title follows the name. */
    const h1t = (($('h1', doc) || {}).textContent || '').replace(/[\u200b\ufeff]/g, '').trim();
    if (!cur.node && !cur.name && !h1t) { const dir = ro ? null : attached(cur.dir) ? cur.dir : root; if (dir) await readDir(dir); let n = 1; while (dir && find(dir, 'Untitled ' + n + '.html')) n++; fname = 'Untitled ' + n + '.html'; }
    const html = build();
    if (ro) { fname = cur.node ? cur.node.name : cur.name ? cur.name : h1t ? fileName(h1t) + '.html' : fname; download(html); afterSave(true); return; }
    try {
      if (cur.node) {
        /* Changed on disk means the content differs from what was last read or written here; a new date alone (a sync tool touching the file) does not count. */
        let changed = false, old = null, oldTime = 0; try { const f = await cur.node.handle.getFile(); old = await f.text(); oldTime = f.lastModified; changed = !!cur.mtime && oldTime !== cur.mtime && (cur.disk === undefined || old !== cur.disk); } catch (e) { }
        if (changed && !confirm('"' + label(cur.node) + '" has changed on disk since it was opened here.\n\nOK: save and replace what is on disk.\nCancel: do not save.')) return;
        await write(cur.node.handle, html);
        /* The version just replaced goes into history, so every saved version can be brought back. */
        if (old !== null && old !== html && !inTrash(cur.node)) { try { await addSnap(cur.node, old, oldTime, false); } catch (e) { say('The page was saved, but its earlier version could not be copied to history: ' + e.message, true); } }
      } else {
        const dir = attached(cur.dir) ? cur.dir : root; await readDir(dir);
        let name = cur.name || (h1t ? fileName(h1t) + '.html' : fname);
        if (find(dir, name)) { name = await clash(dir, name); if (!name) return; }
        await write(await dir.handle.getFileHandle(name, { create: true }), html);
        await readDir(dir); cur.dir = dir; cur.node = find(dir, name); cur.name = name; dir.open = true;
      }
      handle = cur.node.handle; fname = cur.node.name; sel = cur.node; cur.mtime = (await handle.getFile()).lastModified; cur.disk = html; cur.node.meta = { mtime: cur.mtime, size: html.length }; cur.snap = undefined; rec = null;
      afterSave(false); if (!msgEl.classList.contains('bad')) say(''); render();
    } catch (e) { say('Could not save the page: ' + e.message, true); }
  }
  const targetDir = () => { let d = sel ? (sel.kind === 'directory' ? sel : sel.parent) : root; const t = trashNode(), h = find(root, '.history'), s = find(root, '.notebook'); if (!attached(d) || within(d, t) || within(d, h) || within(d, s)) d = root; return d; };
  /* Called after New: the blank page belongs to the selected folder and gets its file at first save. */
  async function newPage() { setKind('page'); if (!root) { cur = null; return; } const d = targetDir(); cur = { dir: d, node: null, kind: 'page' }; if (d !== root) { d.open = true; if (!d.kids) await readDir(d); } render(); }
  async function newFolder() {
    const d = targetDir(); try {
      await readDir(d); let name = 'New folder', i = 2; while (find(d, name)) name = 'New folder ' + i++;
      await d.handle.getDirectoryHandle(name, { create: true }); await readDir(d); d.open = true; sel = find(d, name); renaming = sel; render();
    } catch (e) { say('Could not create the folder: ' + e.message, true); }
  }
  function endRename() { renaming = null; render(); tree.focus(); }
  /* Rename is checked when Enter is pressed, never while typing. A name that would clash is refused and the box stays open. */
  async function commitRename(n, name, inp) {
    if (name === n.name) return endRename();
    const stem = isPage(n) ? name.replace(/\.html?$/i, '') : name, bad = badName(stem);
    if (bad) { say(bad, true); return; }
    await readDir(n.parent);
    const other = find(n.parent, name); if (other && other !== n) { say('"' + name + '" is already in this folder. Choose another name.', true); if (inp.isConnected) inp.focus(); return; }
    try { renaming = null; const m = await relocate(n, n.parent, name); if (sel === n) sel = m; say(''); } catch (e) { say('Could not rename: ' + e.message, true); }
    render(); tree.focus();
  }
  async function move(n, dest) {
    if (n.parent === dest || isProtected(n)) return;
    if (within(dest, n)) { say('A folder cannot be moved into itself.', true); return; }
    try {
      await readDir(dest);
      if (dest === trashNode()) return void await toTrash(n);
      if (find(dest, n.name)) { say('"' + n.name + '" is already in ' + (dest === root ? 'the notebook folder' : '"' + dest.name + '"') + '. Rename one of them first.', true); return; }
      dest.open = true; const m = await relocate(n, dest, n.name); if (sel === n) sel = m; say('');
    } catch (e) { say('Could not move: ' + e.message, true); }
    render();
  }
  /* The open page is leaving the tree: its content stays in the editor as a blank new page would. */
  function holdsOpen(n) { return !!(cur && cur.node && within(cur.node, n)); }
  async function toTrash(n) {
    if (isProtected(n) || inTrash(n)) return;
    const open = holdsOpen(n);
    if (open && dirty && !confirm('"' + pageTitle() + '" is open and has unsaved changes, which will be lost.\n\nOK: move to trash.\nCancel: keep it.')) return;
    try {
      const rel = pathArr(n), d = await nodeAt(['.trash', ...rel.slice(0, -1)], true); await readDir(d);
      const name = find(d, n.name) ? stamp(n.name) : n.name, from = n.parent;
      await moveEntry(n, d, name); await readDir(from); await readDir(d);
      if (unpath(rel)) saveSettings();
      if (sel && !attached(sel)) sel = null;
      if (open) { blank(); setKind('page'); cur = { dir: attached(from) ? from : root, node: null, kind: 'page' }; }
      else if (cur && !cur.node && !attached(cur.dir)) cur.dir = attached(from) ? from : root;
      say('Moved to trash: ' + rel.join('/')); measure();
    } catch (e) { say('Could not move to trash: ' + e.message, true); }
    render();
  }
  async function restore(n) {
    const rel = pathArr(n).slice(1);
    try {
      const d = await nodeAt(rel.slice(0, -1), true); await readDir(d);
      if (find(d, n.name)) { say('"' + n.name + '" is already in ' + (d === root ? 'the notebook folder' : '"' + d.name + '"') + '. Rename one of them, then restore.', true); return; }
      const m = await relocate(n, d, n.name); for (let p = d; p; p = p.parent) p.open = true; sel = m; say('Restored: ' + rel.join('/')); measure();
    } catch (e) { say('Could not restore: ' + e.message, true); }
    render();
  }
  async function removeForever(n) {
    if (!inTrash(n) || !confirm('Delete "' + n.name + '" permanently? This cannot be undone.')) return;
    try { await n.parent.handle.removeEntry(n.name, { recursive: true }); await readDir(n.parent); if (sel === n) sel = null; measure(); } catch (e) { say('Could not delete: ' + e.message, true); }
    render();
  }
  async function emptyTrash() {
    const t = trashNode(); if (!t) return; await readDir(t);
    if (!t.kids.length) { say('The trash is empty.'); return; }
    if (!confirm('Delete everything in the trash permanently (' + t.kids.length + (t.kids.length === 1 ? ' item' : ' items') + ' at the top level)? This cannot be undone.')) return;
    try { for (const k of [...t.kids]) await t.handle.removeEntry(k.name, { recursive: true }); await readDir(t); if (sel && !attached(sel)) sel = null; say('Trash emptied.'); measure(); } catch (e) { say('Could not empty the trash: ' + e.message, true); }
    render();
  }
  /* Files the editor does not open can be shown by the browser in a new tab. Files that can carry script are left out. */
  const tabOk = n => n.kind === 'file' && !/\.(html?|xhtml|svg|xml|js|mjs)$/i.test(n.name);
  /* Kinds of file a browser is known not to show (it would only download them, or open an empty tab): the menu item stays, switched off. */
  const NO_VIEW = /\.(docx?|docm|dotx?|xlsx?|xlsm|xlsb|xltx?|pptx?|pptm|ppsx?|potx?|od[tspg]|rtf|pages|numbers|key|vsdx?|one|pub|mpp|msg|eml|pst|zip|7z|rar|gz|tgz|bz2|xz|tar|iso|dmg|pkg|exe|msi|app|apk|bin|dll|jar|psd|ai|indd|sketch|fig|drawio|gliffy|epub|mobi|sqlite|db|mdb|accdb|parquet|pbix|twbx?)$/i;
  const tabItem = n => ['Open in new browser tab', () => openTab(n), NO_VIEW.test(n.name) ? 'The browser cannot show this kind of file. Open it from its folder on this computer.' : ''];
  async function openTab(n) { try { const u = URL.createObjectURL(await n.handle.getFile()); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { say('Could not open ' + n.name + ': ' + e.message, true); } }

  /* ----- history: full copies of pages, kept in .history/<page path>/, one file a copy -----
     "<date time>.html" is a version that was saved and later replaced, named for when it was saved.
     "<date time> unsaved.html" is work that had not been saved when the copy was taken.
     Nothing is written unless the page differs from what is on disk and from the copy before it. */
  const CFG = { historyMinutes: 5, historyNoteMB: 50, historyWarnMB: 100 };   // can be set in .notebook/settings.json
  let cfg = { ...CFG }, lastTick = Date.now(), sizes = { history: 0, trash: 0, ready: false }, rec = null;
  const SNAP = /^(\d{4})-(\d\d)-(\d\d) (\d\d)\.(\d\d)\.(\d\d)(?:-(\d+))?( unsaved)?\.[A-Za-z0-9]+$/, UNSAVED = / unsaved\.[A-Za-z0-9]+$/;   // a copy keeps the extension of its file
  const p2 = n => String(n).padStart(2, '0');
  const snapName = (ms, unsaved, i, ext) => { const d = new Date(ms); return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()) + ' ' + p2(d.getHours()) + '.' + p2(d.getMinutes()) + '.' + p2(d.getSeconds()) + (i ? '-' + i : '') + (unsaved ? ' unsaved' : '') + (ext || '.html'); };
  const snapTime = name => { const m = name.match(SNAP); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0; };
  const snapKey = name => snapTime(name) + (+(name.match(SNAP) || [])[7] || 1);   // copies made in the same second keep their order
  const isSnap = k => k.kind === 'file' && SNAP.test(k.name);
  const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : (b ? Math.max(1, Math.round(b / 1024)) : 0) + ' KB';
  const when = name => new Date(snapTime(name)).toLocaleString();
  /* A page's copies, newest first. */
  async function snaps(n) { const d = await nodeAt(['.history', ...pathArr(n)]); if (!d || d.kind !== 'directory') return []; await readDir(d); return d.kids.filter(isSnap).sort((a, b) => snapKey(b.name) - snapKey(a.name)); }
  /* html: a page's text, or the bytes (a Blob) of a Markdown or text file, so a copy is the file as it was, byte for byte. */
  async function addSnap(n, html, ms, unsaved) {
    const d = await nodeAt(['.history', ...pathArr(n)], true); await readDir(d);
    const blob = typeof html === 'string' ? null : html, bytes = blob ? blob.size : new Blob([html]).size, mine = blob ? new Uint8Array(await blob.arrayBuffer()) : null;
    for (const k of d.kids.filter(isSnap)) { try { const f = await k.handle.getFile(); if (f.size === bytes && (blob ? sameBytes(new Uint8Array(await f.arrayBuffer()), mine) : await f.text() === html)) return false; } catch (e) { } }   // already kept
    const ext = extName(n); let name = snapName(ms, unsaved, 0, ext), i = 2; while (find(d, name)) name = snapName(ms, unsaved, i++, ext);
    await write(await d.handle.getFileHandle(name, { create: true }), html); await readDir(d);
    sizes.history += bytes; statusUI(); return true;
  }
  /* Unsaved work on the open page. Called on a timer; a page left open and untouched writes nothing. */
  async function snapshot() {
    if (!root || ro || !cur || !cur.node || !dirty || inTrash(cur.node) || (cur.kind === 'text' && TXT.readOnly())) return false;
    const html = curText(); if (html === cur.disk || html === cur.snap) return false;
    try { const made = await addSnap(cur.node, cur.kind === 'page' || !cur.enc ? html : TXT.encode(html, cur.enc), Date.now(), true); cur.snap = html; return made; } catch (e) { say('Could not write the history copy: ' + e.message, true); return false; }
  }
  /* On opening a page: unsaved work newer than the file means the editor closed before it was saved. */
  async function checkRecover(n, text, mtime) {
    try { const s = (await snaps(n))[0]; if (s && UNSAVED.test(s.name) && snapTime(s.name) >= Math.floor(mtime / 1000) * 1000 && await copyText(n, s) !== text) rec = { node: n, snap: s }; } catch (e) { }
  }
  /* The text of a history copy: a page's as it is; a Markdown or text file's decoded like the file, line breaks as \n. */
  async function copyText(n, s) {
    const f = await s.handle.getFile(); if (isPage(n)) return f.text();
    const d = TXT.decode(await f.arrayBuffer()); return d.error ? new TextDecoder('windows-1252').decode(await f.arrayBuffer()).replace(/\r\n?/g, '\n') : d.text;
  }
  function recUI() { const b = $('#nb-rec'), on = !!(rec && cur && cur.node === rec.node); b.hidden = !on; if (on) $('#nb-rec-t').textContent = 'Unsaved changes to this page from ' + when(rec.snap.name) + ' were found in its history.'; }
  /* Restore puts a copy in the editor as unsaved changes. Nothing on disk changes until Save, and that save keeps the version it replaces. */
  async function restoreSnap(n, s) {
    if (!(await leave())) return;
    let text; try { text = await copyText(n, s); } catch (e) { say('Could not read the history copy: ' + e.message, true); return; }
    dirty = false; if (!cur || cur.node !== n) { await openPage(n); if (!cur || cur.node !== n) return; }
    if (cur.kind === 'text') TXT.restore(text);
    else if (cur.kind === 'md') { cur.meta = MD.read(text.replace(/\r\n?/g, '\n')); load('<main>' + await mdPictures(cur.meta.html, n.parent) + '</main>', n.name, { asTyped: true }); }
    else { load(text, n.name); handle = n.handle; }
    dirty = true; status(); cur.snap = undefined; rec = null; sel = n;
    say('Restored the copy from ' + when(s.name) + '. It is not saved yet: press Save to keep it.'); render();
  }
  async function showHistory(n) {
    const list = await snaps(n), box = $('#nb-hist-list'); box.textContent = '';
    $('#nb-hist-h').textContent = 'History: ' + label(n);
    $('#nb-hist-t').textContent = list.length ? 'Restore puts a copy in the editor as unsaved changes. Nothing on disk changes until you press Save.' : 'No copies yet. A copy is kept each time you save over an earlier version, and every ' + cfg.historyMinutes + ' minutes while the page has unsaved changes.';
    for (const [i, s] of list.entries()) {
      let size = 0; try { size = (await s.handle.getFile()).size; } catch (e) { }
      const r = document.createElement('div'); r.className = 'nb-li';
      for (const t of [when(s.name), UNSAVED.test(s.name) ? 'Unsaved changes' : 'Saved version', fmt(size)]) { const c = document.createElement('span'); c.textContent = t; r.appendChild(c); }
      const b = document.createElement('button'); b.type = 'button'; b.value = 'r' + i; b.textContent = 'Restore'; r.appendChild(b); box.appendChild(r);
    }
    const a = await dlg($('#nb-hist')); if (a[0] === 'r') await restoreSnap(n, list[+a.slice(1)]);
  }
  async function moveHistory(a, b) {
    if ([a[0], b[0]].some(x => x === '.trash' || x === '.history' || x === '.notebook')) return;
    try { const h = await nodeAt(['.history', ...a]); if (!h) return; const d = await nodeAt(['.history', ...b.slice(0, -1)], true); await readDir(d); if (find(d, b[b.length - 1])) return; const from = h.parent; await moveEntry(h, d, b[b.length - 1]); await readDir(from); await readDir(d); } catch (e) { }
  }

  /* ----- sizes, the status line, and clean-up ----- */
  async function walkFiles(dir, pre, out) {
    for await (const h of dir.values()) { if (h.kind === 'file') { try { out.push({ name: h.name, pre, size: (await h.getFile()).size, dir }); } catch (e) { } } else await walkFiles(h, pre + h.name + '/', out); }
    return out;
  }
  const filesIn = async name => { try { return await walkFiles(await root.handle.getDirectoryHandle(name), '', []); } catch (e) { return []; } };
  const total = fs => fs.reduce((t, f) => t + f.size, 0);
  async function measure() {
    if (!root || ro) return sizes;
    const r = root, h = await filesIn('.history'), t = await filesIn('.trash'); if (r !== root) return sizes;
    sizes = { history: total(h), trash: total(t), ready: true, hist: h, tr: t }; statusUI(); return sizes;
  }
  function statusUI() {
    const b = $('#nb-status'); b.hidden = !root || ro; if (b.hidden) return;
    const mb = sizes.history / 1048576, lvl = mb >= cfg.historyWarnMB ? 'warn' : mb >= cfg.historyNoteMB ? 'note' : 'ok';
    b.className = 'is-' + lvl; $('#nb-status-ic').innerHTML = ic(lvl === 'warn' ? 'warning' : lvl === 'note' ? 'info' : 'check-circle');
    $('#nb-status-t').textContent = sizes.ready ? 'History ' + fmt(sizes.history) + (sizes.trash ? ' | Trash ' + fmt(sizes.trash) : '') : 'History: measuring';
    b.title = (lvl === 'warn' ? 'History is over ' + cfg.historyWarnMB + ' MB. ' : lvl === 'note' ? 'History is over ' + cfg.historyNoteMB + ' MB. ' : '') + 'Click to review and clean up history and trash';
  }
  /* History grouped by page; a page that is in neither the notebook nor the trash is an orphan. */
  async function analyse() {
    const s = await measure(), pages = new Map();
    for (const f of s.hist || []) { if (!SNAP.test(f.name) || !f.pre) continue; const k = f.pre.slice(0, -1); if (!pages.has(k)) pages.set(k, { path: k, files: [] }); pages.get(k).files.push(f); }
    for (const p of pages.values()) {
      p.files.sort((a, b) => snapKey(b.name) - snapKey(a.name)); p.size = total(p.files);
      const arr = p.path.split('/'); p.gone = !(await nodeAt(arr)) && !(await nodeAt(['.trash', ...arr]));
    }
    return { pages: [...pages.values()].sort((a, b) => b.size - a.size), history: s.history, trash: s.trash, trashCount: (s.tr || []).length };
  }
  async function prune(dir) { let n = 0; for await (const h of dir.values()) { if (h.kind === 'directory' && await prune(h) === 0) { try { await dir.removeEntry(h.name); continue; } catch (e) { } } n++; } return n; }
  async function cleanUp() {
    const box = $('#nb-clean-list'), note = $('#nb-clean-e'); note.textContent = '';
    for (; ;) {
      const A = await analyse(), all = A.pages.flatMap(p => p.files), gone = A.pages.filter(p => p.gone);
      $('#nb-clean-t').textContent = 'History: ' + all.length + (all.length === 1 ? ' copy' : ' copies') + ' of ' + A.pages.length + (A.pages.length === 1 ? ' page, ' : ' pages, ') + fmt(A.history) + '. Trash: ' + A.trashCount + (A.trashCount === 1 ? ' file, ' : ' files, ') + fmt(A.trash) + '.';
      box.textContent = '';
      for (const p of A.pages) {
        const r = document.createElement('div'); r.className = 'nb-li' + (p.gone ? ' is-gone' : '');
        for (const t of [p.path + (p.gone ? ' (page no longer exists)' : ''), p.files.length + (p.files.length === 1 ? ' copy' : ' copies'), fmt(p.size), 'oldest ' + new Date(snapTime(p.files[p.files.length - 1].name)).toLocaleDateString()]) { const c = document.createElement('span'); c.textContent = t; r.appendChild(c); }
        box.appendChild(r);
      }
      $('#nb-orph-t').textContent = 'History of pages that no longer exist: ' + gone.length + (gone.length === 1 ? ' page, ' : ' pages, ') + fmt(total(gone.flatMap(p => p.files)));
      $('#nb-trash-t').textContent = 'Trash: ' + A.trashCount + (A.trashCount === 1 ? ' file, ' : ' files, ') + fmt(A.trash);
      const a = await dlg($('#nb-clean')); if (a === 'cancel') break;
      if (a === 'trash') { await emptyTrash(); note.textContent = msgEl.textContent; continue; }
      const keep = Math.max(1, Math.floor(+$('#nb-keep').value) || 0), days = Math.max(1, Math.floor(+$('#nb-days').value) || 0), cut = Date.now() - days * 86400000;
      const del = a === 'keep' ? A.pages.flatMap(p => p.files.slice(keep)) : a === 'days' ? all.filter(f => snapTime(f.name) < cut) : gone.flatMap(p => p.files);
      const what = a === 'keep' ? 'beyond the newest ' + keep + ' of each page' : a === 'days' ? 'older than ' + days + ' days' : 'of pages that no longer exist';
      if (!del.length) { note.textContent = 'Nothing to delete: there are no copies ' + what + '.'; continue; }
      const names = del.slice(0, 6).map(f => '  ' + f.pre + f.name).join('\n') + (del.length > 6 ? '\n  and ' + (del.length - 6) + ' more' : '');
      if (!confirm('Delete ' + del.length + (del.length === 1 ? ' history copy' : ' history copies') + ' ' + what + ' (' + fmt(total(del)) + ')? This cannot be undone.\n\n' + names)) { note.textContent = 'Nothing was deleted.'; continue; }
      let done = 0; try { for (const f of del) { await f.dir.removeEntry(f.name); done++; } await prune(await root.handle.getDirectoryHandle('.history')); } catch (e) { note.textContent = 'Stopped: ' + e.message; }
      if (done === del.length) note.textContent = 'Deleted ' + done + (done === 1 ? ' copy, ' : ' copies, ') + fmt(total(del)) + '.';
      rec = null; await refresh();
    }
    await measure();
  }

  /* ----- right-click menu ----- */
  function menuFor(n, x, y) {
    const m = [], t = trashNode();
    if (!n) return ro ? [] : [['New page', () => ACT.new()], ['New folder', newFolder], null, ['Refresh', refresh]];
    if (ro) { if (opens(n)) m.push(['Open', () => openPage(n)]); if (isMd(n)) m.push(['Open as text', () => openPage(n, 'text')]); if (tabOk(n)) m.push(tabItem(n)); return m; }
    if (inTrash(n)) { m.push(['Restore', () => restore(n)]); if (opens(n)) m.push(['Open', () => openPage(n)]); if (tabOk(n)) m.push(tabItem(n)); m.push(null, ['Delete permanently', () => removeForever(n)]); return m; }
    if (n === t) return [['Empty trash', emptyTrash]];
    if (n.kind === 'directory') { if (!(n.parent === root && (n.name === '.history' || n.name === '.notebook'))) m.push(['New page here', () => { sel = n; ACT.new(); }], ['New folder here', () => { sel = n; newFolder(); }]); m.push(['Sort this folder', () => sortMenu(n, x, y)]); }
    else { if (opens(n)) m.push(['Open', () => openPage(n)]); if (isMd(n)) m.push(['Open as text', () => openPage(n, 'text')]); if (opens(n) && !within(n, find(root, '.history'))) m.push([isPage(n) ? 'Page history' : 'File history', () => showHistory(n)]); if (canFav(n)) m.push([isFav(n) ? 'Remove from favourites' : 'Add to favourites', () => toggleFav(n)]); if (tabOk(n)) m.push(tabItem(n)); }
    if (!isProtected(n)) { if (m.length) m.push(null); m.push(['Rename', () => { renaming = n; render(); }], ['Move to trash', () => toTrash(n)]); }
    return m;
  }
  function showMenu(n, x, y) { drawMenu(menuFor(n, x, y), x, y); }
  function drawMenu(items, x, y) {
    menu.textContent = ''; if (!items.length) return;
    items.forEach(it => { if (!it) { menu.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it[0]; if (it[2]) { b.disabled = true; b.title = it[2]; } b.addEventListener('click', () => { hideMenu(); it[1](); }); menu.appendChild(b); });
    menu.hidden = false; menu.style.left = Math.min(x, innerWidth - menu.offsetWidth - 8) + 'px'; menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 8) + 'px';
  }
  function hideMenu() { menu.hidden = true; }

  /* ----- opening a notebook ----- */
  async function openRoot(h, readOnly, auto) {
    const wasPage = !!cur; root = { name: h.name, kind: 'directory', handle: h, parent: null, kids: null, open: true }; ro = !!readOnly; sel = null; renaming = null;
    try { await readDir(root); } catch (e) { root = null; say('The folder could not be read: ' + e.message, true); render(); return; }
    await loadSettings(); rec = null; sizes = { history: 0, trash: 0, ready: false };
    if ((!auto && wasPage) || kind !== 'page') { blank(); setKind('page'); }
    cur = handle ? null : { dir: root, node: null, kind: 'page' };
    if (!ro) { remembered = h; try { await kv('readwrite', s => s.put(h, 'root')); } catch (e) { } }
    say(''); render(); if (!ro) measure(); checkFavs();
  }
  async function pick() {
    const switching = !!root; if (switching && !(await leave())) return;
    if (!canWrite) { $('#nb-dir').click(); return; }
    try { await openRoot(await showDirectoryPicker({ id: 'fine-line-notebook', mode: 'readwrite' }), false, !switching); } catch (e) { if (e.name !== 'AbortError') say('The folder could not be opened: ' + e.message, true); }
  }
  async function reconnect() {
    if (!remembered) return;
    try { if (await remembered.requestPermission({ mode: 'readwrite' }) === 'granted') await openRoot(remembered, false, true); else say('Access to "' + remembered.name + '" was not allowed. Reconnect to try again, or choose another folder.', true); } catch (e) { say('The folder could not be opened: ' + e.message, true); }
  }
  /* Read-only stand-in for a folder handle, built from the file list a folder input gives (browsers without folder access). */
  function listTree(files) {
    const mk = name => ({ kind: 'directory', name, k: new Map(), async *values() { yield* this.k.values(); } }); let top = null;
    for (const f of files) { const p = f.webkitRelativePath.split('/'); top = top || mk(p[0]); let d = top; for (const s of p.slice(1, -1)) { if (!d.k.has('d/' + s)) d.k.set('d/' + s, mk(s)); d = d.k.get('d/' + s); } d.k.set('f/' + f.name, { kind: 'file', name: f.name, getFile: async () => f }); }
    return top;
  }
  function toggle(show) {
    const on = show === undefined ? panel.hidden : show; panel.hidden = !on; document.documentElement.classList.toggle('nb-open', on);
    const b = $('#nb-tab'); b.hidden = on; b.setAttribute('aria-expanded', on ? 'true' : 'false');
    try { localStorage.setItem('fle-nb-open', on ? '1' : '0'); } catch (e) { }
    chromeHeight(); fit(); if (on) render();
    if (on && !root && remembered) remembered.queryPermission({ mode: 'readwrite' }).then(p => { if (p === 'granted' && !root) openRoot(remembered, false, true); }).catch(() => { });
  }
  function warnOff() { $('#nbwarn').hidden = true; try { localStorage.setItem('fle-nb-warn', '0'); } catch (e) { } chromeHeight(); }

  /* ----- wiring ----- */
  const nodeOf = e => { const r = e.target.closest('.nb-row'); return r && r.dataset.i !== undefined ? flat[+r.dataset.i] : null; };
  async function clickRow(n) {
    if (n.kind === 'directory') { sel = n; n.open = !n.open; if (n.open) { try { await readDir(n); } catch (e) { n.open = false; say('Could not read ' + n.name + ': ' + e.message, true); } } render(); }
    else if (opens(n)) await openPage(n);
    else { sel = n; render(); }
  }
  function wire() {
    panel.addEventListener('mousedown', e => { if (e.target.closest('button')) e.preventDefault(); });
    $('#nb-tab').addEventListener('mousedown', e => e.preventDefault());
    $('#nb-tab').addEventListener('click', () => toggle(true));
    panel.addEventListener('click', e => {
      const b = e.target.closest('button[data-nb]'); if (!b) return; const a = b.dataset.nb;
      if (a === 'hide') toggle(false); else if (a === 'clean') cleanUp(); else if (a === 'recover') { if (rec) restoreSnap(rec.node, rec.snap); } else if (a === 'norecover') { rec = null; recUI(); } else if (a === 'pick') pick(); else if (a === 'reconnect') reconnect(); else if (a === 'newpage') ACT.new(); else if (a === 'newfolder') newFolder(); else if (a === 'refresh') refresh(); else if (a === 'sort') { const r = b.getBoundingClientRect(); sortMenu(null, r.left, r.bottom + 2); }
      else if (a === 'hidden') { showHidden = !showHidden; render(); saveSettings().then(() => readDir(root)).then(render, () => { }); }
    });
    const favBox = $('#nb-fav'), favOf = e => { const r = e.target.closest('.nb-frow'); return r ? favs[+r.dataset.f] : null; }, favFlip = () => { favOpen = !favOpen; saveSettings(); render(); };
    favBox.addEventListener('click', e => { if (e.target.closest('.nb-fav-h')) return favFlip(); const p = favOf(e); if (!p) return; if (e.target.closest('.nb-star')) dropFav(p); else openFav(p); });
    favBox.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target.closest('.nb-fav-h')) { e.preventDefault(); e.stopPropagation(); favFlip(); const h = $('.nb-fav-h', favBox); if (h) h.focus(); } });
    favBox.addEventListener('contextmenu', e => { e.preventDefault(); const p = favOf(e); if (p) drawMenu([['Open', () => openFav(p)], ['Remove from favourites', () => dropFav(p)]], e.clientX, e.clientY); });
    tree.addEventListener('click', e => { if (renaming) return; const n = nodeOf(e); if (n && e.target.closest('.nb-star')) { toggleFav(n); return; } if (n) clickRow(n); else if (e.target === tree) { sel = null; render(); } });
    tree.addEventListener('contextmenu', e => { e.preventDefault(); if (renaming) return; const n = nodeOf(e); if (n) { sel = n; render(); } showMenu(n, e.clientX, e.clientY); });
    tree.addEventListener('keydown', e => {
      if (!e.ctrlKey && !e.metaKey) e.stopPropagation();
      if (renaming || !root) return; const i = flat.indexOf(sel), k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); const j = Math.max(0, Math.min(flat.length - 1, i + (k === 'ArrowDown' ? 1 : -1))); if (flat[j]) { sel = flat[j]; render(); const r = $('.nb-row.is-sel', tree); if (r) r.scrollIntoView({ block: 'nearest' }); } }
      else if (!sel) return;
      else if (k === 'ArrowRight' && sel.kind === 'directory' && !sel.open) { e.preventDefault(); clickRow(sel); }
      else if (k === 'ArrowLeft') { e.preventDefault(); if (sel.kind === 'directory' && sel.open) clickRow(sel); else if (sel.parent !== root) { sel = sel.parent; render(); } }
      else if (k === 'Enter') { e.preventDefault(); clickRow(sel); }
      else if (k === 'F2' && !ro && !isProtected(sel) && !inTrash(sel)) { e.preventDefault(); renaming = sel; render(); }
      else if (k === 'Delete' && !ro) { e.preventDefault(); if (inTrash(sel)) removeForever(sel); else toTrash(sel); }
    });
    tree.addEventListener('dragstart', e => { const n = nodeOf(e); if (!n || ro || isProtected(n) || renaming) { e.preventDefault(); return; } dragged = n; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', n.name); });
    const dropDir = e => { const n = nodeOf(e); return n ? (n.kind === 'directory' ? n : n.parent) : root; };
    const mark = r => { $$('.is-drop', panel).forEach(x => x.classList.remove('is-drop')); if (r) r.classList.add('is-drop'); };
    tree.addEventListener('dragover', e => { if (!dragged) return; const d = dropDir(e); if (d === dragged.parent || within(d, dragged)) { mark(null); return; } e.preventDefault(); e.stopPropagation(); e.dataTransfer.dropEffect = 'move'; const r = e.target.closest('.nb-row'); mark(d === root ? tree : r && flat[+r.dataset.i] === d ? r : null); });
    tree.addEventListener('dragleave', e => { if (e.target === tree) mark(null); });
    tree.addEventListener('drop', e => { if (!dragged) return; e.preventDefault(); e.stopPropagation(); const d = dropDir(e), n = dragged; dragged = null; mark(null); move(n, d); });
    tree.addEventListener('dragend', () => { dragged = null; mark(null); });
    document.addEventListener('mousedown', e => { if (!menu.hidden && !e.target.closest('#nb-menu')) hideMenu(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !menu.hidden) { e.stopPropagation(); hideMenu(); } }, true);
    window.addEventListener('blur', hideMenu);
    window.addEventListener('focus', () => { if (root && !ro && !panel.hidden && !renaming && menu.hidden && !dragged && Date.now() - lastScan > 1500) refresh(); });
    $('#nb-clash-n').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#nb-clash button[value="rename"]').click(); } });
    $('#nb-dir').addEventListener('change', async e => { const t = listTree(e.target.files); e.target.value = ''; if (!t) { say('That folder has no files to show.', true); return; } await openRoot(t, true, !root); });
    $('#nb-rz').addEventListener('pointerdown', e => {
      e.preventDefault(); const mv = x => { const w = Math.max(180, Math.min(560, x.clientX)); document.documentElement.style.setProperty('--nbw', w + 'px'); fit(); };
      const up = x => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); try { localStorage.setItem('fle-nb-w', getComputedStyle(document.documentElement).getPropertyValue('--nbw').trim()); } catch (e2) { } };
      addEventListener('pointermove', mv); addEventListener('pointerup', up);
    });
  }
  async function init() {
    wire();
    { const u = ACT.undo, r = ACT.redo; ACT.undo = () => kind === 'text' ? TXT.undo() : u(); ACT.redo = () => kind === 'text' ? TXT.redo() : r(); ACT.xwrap = () => TXT.wrap(); ACT.xfind = () => TXT.find(); ACT.xsrc = mdSwitch; }
    window.addEventListener('beforeprint', () => { if (kind === 'text') TXT.printFill(); }); window.addEventListener('afterprint', () => TXT.printClear());
    let open = false, warn = true, w = '';
    try { open = localStorage.getItem('fle-nb-open') === '1'; warn = localStorage.getItem('fle-nb-warn') !== '0'; w = localStorage.getItem('fle-nb-w') || ''; } catch (e) { }
    if (/^\d+px$/.test(w)) document.documentElement.style.setProperty('--nbw', w);
    setInterval(() => { if (Date.now() - lastTick >= cfg.historyMinutes * 60000) { lastTick = Date.now(); snapshot(); } }, 20000);
    if (!canWrite && warn) { $('#nbwarn').hidden = false; chromeHeight(); }
    if (open) toggle(true);
    if (canWrite) { try { const h = await kv('readonly', s => s.get('root')); if (h) { remembered = h; if (open && !root && await h.queryPermission({ mode: 'readwrite' }) === 'granted') await openRoot(h, false, true); } } catch (e) { } }
    render();
  }
  return {
    init, toggle, warnOff, leave, savePage, newPage, refresh, openRoot, listTree, snapshot, measure,
    on: () => !!root, page: () => !!(root && cur), detach: () => { if (kind !== 'page') setKind('page'); if (cur) { cur = null; if (root) render(); } },
    foreign: () => kind !== 'page', textOn: () => kind === 'text', TXT, MD, get kind() { return kind; },
    get state() { return { root: root && root.name, ro, cur: cur && { dir: pathArr(cur.dir).join('/'), node: cur.node && pathArr(cur.node).join('/'), kind: cur.kind || 'page' }, sel: sel && pathArr(sel).join('/'), rows: flat.map(n => pathArr(n).join('/')) }; },
  };
})();
