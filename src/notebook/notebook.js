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
  let showHidden = true, lastScan = 0, msgTimer = null, queue = Promise.resolve();

  const ic = n => $('#nb-ic').content.querySelector('[data-ic="' + n + '"]').innerHTML;
  const lower = s => s.toLowerCase();
  const isPage = n => n.kind === 'file' && /\.html?$/i.test(n.name);
  const isText = n => n.kind === 'file' && /\.(md|markdown|txt)$/i.test(n.name);
  const opens = n => isPage(n) || isText(n);
  const label = n => isPage(n) ? n.name.replace(/\.html?$/i, '') : n.name;
  const find = (dir, name) => (dir.kids || []).find(k => lower(k.name) === lower(name));
  const pathArr = n => { const p = []; for (; n && n.parent; n = n.parent) p.unshift(n.name); return p; };
  const within = (n, anc) => { for (; n; n = n.parent) if (n === anc) return true; return false; };
  const isProtected = n => n.parent === root && PROTECTED.includes(n.name);
  const trashNode = () => root && find(root, '.trash');
  const inTrash = n => { const t = trashNode(); return !!t && n !== t && within(n, t); };
  const attached = n => { for (; n.parent; n = n.parent) if (!(n.parent.kids || []).includes(n)) return false; return n === root; };
  const badName = v => !v ? 'Enter a name.' : /[\\/:*?"<>|\u0000-\u001f]/.test(v) ? 'A name cannot contain \\ / : * ? " < > |' : (/^\.+$/.test(v) || /[. ]$/.test(v)) ? 'A name cannot end with a dot or a space.' : '';
  const fileName = t => t.replace(/[\\/:*?"<>|\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+|[. ]+$/g, '').slice(0, 120) || 'Untitled';
  const isOwn = text => /<meta name="generator" content="fine-line-editor">/.test(text.slice(0, 4000)) || (/<nav aria-label="Index"/.test(text) && /<div class="page">/.test(text));
  function stamp(name) { const d = new Date(), p = n => String(n).padStart(2, '0'), s = ' (' + d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + '.' + p(d.getMinutes()) + '.' + p(d.getSeconds()) + ')'; const i = name.lastIndexOf('.'); return i > 0 ? name.slice(0, i) + s + name.slice(i) : name + s; }
  function say(text, bad) { clearTimeout(msgTimer); msgEl.textContent = text || ''; msgEl.classList.toggle('bad', !!bad); if (text && !bad) msgTimer = setTimeout(() => { msgEl.textContent = ''; }, 6000); }

  /* ----- remembered folder: the handle is kept in the browser's own storage, never in a document ----- */
  const idb = () => new Promise((res, rej) => { const r = indexedDB.open('fine-line-notebook', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const kv = async (mode, fn) => { const db = await idb(); return new Promise((res, rej) => { const t = db.transaction('kv', mode), q = fn(t.objectStore('kv')); t.oncomplete = () => { db.close(); res(q && q.result); }; t.onerror = () => { db.close(); rej(t.error); }; }); };

  /* ----- reading and writing ----- */
  async function readDir(n) {
    const old = n.kids || [], kids = [];
    for await (const h of n.handle.values()) { const o = old.find(k => k.name === h.name && k.kind === h.kind); kids.push(o ? Object.assign(o, { handle: h }) : { name: h.name, kind: h.kind, handle: h, parent: n, kids: null, open: false }); }
    n.kids = kids; return kids;
  }
  /* One write at a time, tried up to three times, and read back to confirm what is on disk. */
  function write(h, text) {
    const job = queue.then(async () => {
      let err;
      for (let i = 0; i < 3; i++) {
        try { const w = await h.createWritable(); await w.write(text); await w.close(); if (await (await h.getFile()).text() === text) return; err = new Error('the file read back differently from what was written'); } catch (e) { err = e; }
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
    const from = n.parent, wasOpen = n.open, curRel = cur && cur.node && within(cur.node, n) ? pathArr(cur.node).slice(pathArr(n).length) : null;
    await moveEntry(n, dest, name);
    await readDir(from); if (dest !== from) await readDir(dest);
    const moved = find(dest, name); if (!moved) return null;
    if (wasOpen && moved.kind === 'directory') { moved.open = true; await readDir(moved); }
    if (curRel) { const c = await nodeAt([...pathArr(moved), ...curRel]); if (c) { cur.node = c; cur.dir = c.parent; handle = c.handle; fname = c.name; try { cur.mtime = (await c.handle.getFile()).lastModified; } catch (e) { } status(); } }
    return moved;
  }

  /* ----- settings: .notebook/settings.json in the notebook; missing or damaged settings fall back to defaults ----- */
  async function loadSettings() {
    showHidden = true;
    try { const d = await root.handle.getDirectoryHandle('.notebook'), f = await (await d.getFileHandle('settings.json')).getFile(), s = JSON.parse(await f.text()); if (s && typeof s.showHidden === 'boolean') showHidden = s.showHidden; } catch (e) { }
  }
  async function saveSettings() {
    if (ro || !root) return;
    try {
      const d = await root.handle.getDirectoryHandle('.notebook', { create: true }), fh = await d.getFileHandle('settings.json', { create: true });
      let s = {}; try { s = JSON.parse(await (await fh.getFile()).text()) || {}; } catch (e) { }
      s.showHidden = showHidden; await write(fh, JSON.stringify(s, null, 2) + '\n');
    } catch (e) { say('Could not save the notebook settings: ' + e.message, true); }
  }

  /* ----- the tree ----- */
  function visible(n) {
    const all = (n.kids || []).filter(k => showHidden || k.name[0] !== '.' || (n === root && KEEP.includes(k.name)));
    const pin = k => n === root && k.kind === 'directory' ? PINNED.indexOf(k.name) : -1;
    const by = (a, b) => a.kind !== b.kind ? (a.kind === 'directory' ? -1 : 1) : a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
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
      inp.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitRename(n, inp.value.trim() + ext, inp); } else if (e.key === 'Escape') { e.preventDefault(); endRename(); } });
      inp.addEventListener('blur', () => { if (renaming === n) { renaming = null; render(); } });
      ['click', 'mousedown', 'dblclick', 'contextmenu'].forEach(t => inp.addEventListener(t, e => e.stopPropagation()));
    } else { r.lastChild.textContent = label(n); if (!ro && !isProtected(n)) r.draggable = true; }
    return r;
  }
  function render() {
    const on = !!root; land.hidden = on; tree.hidden = !on; $('#nb-name').textContent = on ? root.name + (ro ? ' (read-only)' : '') : 'Notebook';
    $$('.nb-top button', panel).forEach(b => { const a = b.dataset.nb; b.hidden = a === 'hide' ? false : a === 'pick' ? !on : !on || (ro && a !== 'hidden' && a !== 'newpage'); });
    const hb = $('[data-nb="hidden"]', panel); hb.setAttribute('aria-pressed', showHidden ? 'true' : 'false'); hb.classList.toggle('on', showHidden);
    tree.textContent = ''; flat = [];
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
      const walk = async n => { await readDir(n); for (const k of n.kids) if (k.kind === 'directory' && k.kids) await walk(k).catch(() => { k.kids = null; k.open = false; }); };
      try { await walk(root); } catch (e) { say('The notebook folder could not be read: ' + e.message, true); return; }
      if (cur && cur.node && !attached(cur.node)) { cur.node = null; handle = null; dirty = true; status(); say('The open page was moved, renamed or deleted outside the editor. Press Save to keep it in this folder.', true); }
      if (cur && cur.dir && !attached(cur.dir)) cur.dir = root;
      if (sel && !attached(sel)) sel = null;
    }
    render();
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
  const pageTitle = () => { const h = $('h1', doc), t = h ? h.textContent.trim() : ''; return t || (cur && cur.node ? label(cur.node) : 'This page'); };
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

  /* ----- pages ----- */
  /* Markdown and plain text become page content, which then goes through the same cleaning as any opened document.
     Markdown is converted by marked; text becomes one paragraph a line. A page with no H1 takes the file's name as its title. */
  function importText(name, text) {
    const t = document.createElement('template'), c = t.content; let title = name.replace(/\.[^.]+$/, '');
    text = text.replace(/^\uFEFF/, '');
    if (/\.txt$/i.test(name)) t.innerHTML = text.split(/\r?\n/).filter(l => l.trim()).map(l => '<p>' + esc(l) + '</p>').join('');
    else {
      const fm = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);   // front matter is not content; its title is used when there is no H1
      if (fm) { text = text.slice(fm[0].length); const m = fm[1].match(/^title:[ \t]*(.+)$/m); if (m) title = m[1].trim().replace(/^(['"])(.*)\1$/, '$2') || title; }
      t.innerHTML = marked.parse(text, { gfm: true });
      $$('pre > code', c).forEach(k => { k.parentNode.textContent = k.textContent.replace(/\n$/, ''); });   // the editor's code block is a plain pre
      $$('h5, h6', c).forEach(h => { const n = document.createElement('h4'); n.append(...h.childNodes); h.replaceWith(n); });
      $$('li input[type=checkbox]', c).forEach(i => { const li = i.closest('li'), ul = li.parentNode; if (ul.nodeName !== 'UL') { i.remove(); return; } ul.classList.add('check'); i.removeAttribute('disabled'); const p = i.parentNode; li.prepend(i); if (p !== li && p.nodeName === 'P') { p.replaceWith(...p.childNodes); } });
      $$('ul.check > li', c).forEach(li => { if (!$(':scope > input[type=checkbox]', li)) { const i = document.createElement('input'); i.type = 'checkbox'; li.prepend(i); } const x = li.childNodes[1]; if (x && x.nodeType === 3) x.data = x.data.replace(/^\s+/, ''); });
    }
    if (!$('h1', c)) { const h = document.createElement('h1'); h.textContent = title; c.prepend(h); }
    return t.innerHTML;
  }
  async function openPage(n) {
    if (cur && cur.node === n) { sel = n; render(); return; }
    if (!(await leave())) return;
    let text, mtime;
    try { const f = await n.handle.getFile(); text = await f.text(); mtime = f.lastModified; } catch (e) { say('Could not open ' + n.name + ': ' + e.message, true); return; }
    sel = n;
    if (isText(n)) text = '<main>' + importText(n.name, text) + '</main>';
    if (!isText(n) && isOwn(text)) { handle = ro ? null : n.handle; load(text, n.name); cur = { dir: n.parent, node: n, mtime, disk: text }; say(''); }
    else { handle = null; load(text, n.name); cur = { dir: inTrash(n) ? root : n.parent, node: null }; say('Imported ' + n.name + ' as a new page. The original file stays as it is; Save writes a new page named after the title.'); }
    render();
  }
  /* Save the open page into the notebook. A page that has no file yet is named after its first H1. */
  async function savePage() {
    deactivate(); const html = build();
    if (ro) { fname = cur.node ? cur.node.name : fileName(pageTitle()) + '.html'; download(html); afterSave(true); return; }
    try {
      if (cur.node) {
        /* Changed on disk means the content differs from what was last read or written here; a new date alone (a sync tool touching the file) does not count. */
        let changed = false; try { const f = await cur.node.handle.getFile(); changed = !!cur.mtime && f.lastModified !== cur.mtime && (cur.disk === undefined || await f.text() !== cur.disk); } catch (e) { }
        if (changed && !confirm('"' + label(cur.node) + '" has changed on disk since it was opened here.\n\nOK: save and replace what is on disk.\nCancel: do not save.')) return;
        await write(cur.node.handle, html);
      } else {
        const dir = attached(cur.dir) ? cur.dir : root; await readDir(dir);
        let name = fileName(pageTitle()) + '.html';
        if (find(dir, name)) { name = await clash(dir, name); if (!name) return; }
        await write(await dir.handle.getFileHandle(name, { create: true }), html);
        await readDir(dir); cur.dir = dir; cur.node = find(dir, name); dir.open = true;
      }
      handle = cur.node.handle; fname = cur.node.name; sel = cur.node; cur.mtime = (await handle.getFile()).lastModified; cur.disk = html;
      afterSave(false); say(''); render();
    } catch (e) { say('Could not save the page: ' + e.message, true); }
  }
  const targetDir = () => { let d = sel ? (sel.kind === 'directory' ? sel : sel.parent) : root; const t = trashNode(), h = find(root, '.history'), s = find(root, '.notebook'); if (!attached(d) || within(d, t) || within(d, h) || within(d, s)) d = root; return d; };
  /* Called after New: the blank page belongs to the selected folder and gets its file at first save. */
  async function newPage() { if (!root) { cur = null; return; } const d = targetDir(); cur = { dir: d, node: null }; if (d !== root) { d.open = true; if (!d.kids) await readDir(d); } render(); }
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
      if (sel && !attached(sel)) sel = null;
      if (open) { blank(); cur = { dir: attached(from) ? from : root, node: null }; }
      else if (cur && !cur.node && !attached(cur.dir)) cur.dir = attached(from) ? from : root;
      say('Moved to trash: ' + rel.join('/'));
    } catch (e) { say('Could not move to trash: ' + e.message, true); }
    render();
  }
  async function restore(n) {
    const rel = pathArr(n).slice(1);
    try {
      const d = await nodeAt(rel.slice(0, -1), true); await readDir(d);
      if (find(d, n.name)) { say('"' + n.name + '" is already in ' + (d === root ? 'the notebook folder' : '"' + d.name + '"') + '. Rename one of them, then restore.', true); return; }
      const m = await relocate(n, d, n.name); for (let p = d; p; p = p.parent) p.open = true; sel = m; say('Restored: ' + rel.join('/'));
    } catch (e) { say('Could not restore: ' + e.message, true); }
    render();
  }
  async function removeForever(n) {
    if (!inTrash(n) || !confirm('Delete "' + n.name + '" permanently? This cannot be undone.')) return;
    try { await n.parent.handle.removeEntry(n.name, { recursive: true }); await readDir(n.parent); if (sel === n) sel = null; } catch (e) { say('Could not delete: ' + e.message, true); }
    render();
  }
  async function emptyTrash() {
    const t = trashNode(); if (!t) return; await readDir(t);
    if (!t.kids.length) { say('The trash is empty.'); return; }
    if (!confirm('Delete everything in the trash permanently (' + t.kids.length + (t.kids.length === 1 ? ' item' : ' items') + ' at the top level)? This cannot be undone.')) return;
    try { for (const k of [...t.kids]) await t.handle.removeEntry(k.name, { recursive: true }); await readDir(t); if (sel && !attached(sel)) sel = null; say('Trash emptied.'); } catch (e) { say('Could not empty the trash: ' + e.message, true); }
    render();
  }
  /* Files the editor does not open can be shown by the browser in a new tab. Files that can carry script are left out. */
  const tabOk = n => n.kind === 'file' && !/\.(html?|xhtml|svg|xml|js|mjs)$/i.test(n.name);
  async function openTab(n) { try { const u = URL.createObjectURL(await n.handle.getFile()); window.open(u, '_blank', 'noopener'); setTimeout(() => URL.revokeObjectURL(u), 60000); } catch (e) { say('Could not open ' + n.name + ': ' + e.message, true); } }

  /* ----- right-click menu ----- */
  function menuFor(n) {
    const m = [], t = trashNode();
    if (!n) return ro ? [] : [['New page', () => ACT.new()], ['New folder', newFolder], null, ['Refresh', refresh]];
    if (ro) { if (opens(n)) m.push(['Open', () => openPage(n)]); if (tabOk(n)) m.push(['Open in new browser tab', () => openTab(n)]); return m; }
    if (inTrash(n)) { m.push(['Restore', () => restore(n)]); if (opens(n)) m.push(['Open', () => openPage(n)]); if (tabOk(n)) m.push(['Open in new browser tab', () => openTab(n)]); m.push(null, ['Delete permanently', () => removeForever(n)]); return m; }
    if (n === t) return [['Empty trash', emptyTrash]];
    if (n.kind === 'directory') { if (!(n.parent === root && (n.name === '.history' || n.name === '.notebook'))) m.push(['New page here', () => { sel = n; ACT.new(); }], ['New folder here', () => { sel = n; newFolder(); }]); }
    else { if (opens(n)) m.push(['Open', () => openPage(n)]); if (tabOk(n)) m.push(['Open in new browser tab', () => openTab(n)]); }
    if (!isProtected(n)) { if (m.length) m.push(null); m.push(['Rename', () => { renaming = n; render(); }], ['Move to trash', () => toTrash(n)]); }
    return m;
  }
  function showMenu(n, x, y) {
    const items = menuFor(n); menu.textContent = ''; if (!items.length) return;
    items.forEach(it => { if (!it) { menu.appendChild(document.createElement('hr')); return; } const b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'menuitem'); b.textContent = it[0]; b.addEventListener('click', () => { hideMenu(); it[1](); }); menu.appendChild(b); });
    menu.hidden = false; menu.style.left = Math.min(x, innerWidth - menu.offsetWidth - 8) + 'px'; menu.style.top = Math.min(y, innerHeight - menu.offsetHeight - 8) + 'px';
  }
  function hideMenu() { menu.hidden = true; }

  /* ----- opening a notebook ----- */
  async function openRoot(h, readOnly, auto) {
    const wasPage = !!cur; root = { name: h.name, kind: 'directory', handle: h, parent: null, kids: null, open: true }; ro = !!readOnly; sel = null; renaming = null;
    try { await readDir(root); } catch (e) { root = null; say('The folder could not be read: ' + e.message, true); render(); return; }
    await loadSettings();
    if (!auto && wasPage) blank();
    cur = handle ? null : { dir: root, node: null };
    if (!ro) { remembered = h; try { await kv('readwrite', s => s.put(h, 'root')); } catch (e) { } }
    say(''); render();
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
      if (a === 'hide') toggle(false); else if (a === 'pick') pick(); else if (a === 'reconnect') reconnect(); else if (a === 'newpage') ACT.new(); else if (a === 'newfolder') newFolder(); else if (a === 'refresh') refresh();
      else if (a === 'hidden') { showHidden = !showHidden; render(); saveSettings().then(() => readDir(root)).then(render, () => { }); }
    });
    tree.addEventListener('click', e => { if (renaming) return; const n = nodeOf(e); if (n) clickRow(n); else if (e.target === tree) { sel = null; render(); } });
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
    let open = false, warn = true, w = '';
    try { open = localStorage.getItem('fle-nb-open') === '1'; warn = localStorage.getItem('fle-nb-warn') !== '0'; w = localStorage.getItem('fle-nb-w') || ''; } catch (e) { }
    if (/^\d+px$/.test(w)) document.documentElement.style.setProperty('--nbw', w);
    if (!canWrite && warn) { $('#nbwarn').hidden = false; chromeHeight(); }
    if (open) toggle(true);
    if (canWrite) { try { const h = await kv('readonly', s => s.get('root')); if (h) { remembered = h; if (open && !root && await h.queryPermission({ mode: 'readwrite' }) === 'granted') await openRoot(h, false, true); } } catch (e) { } }
    render();
  }
  return {
    init, toggle, warnOff, leave, savePage, newPage, refresh, openRoot, listTree,
    on: () => !!root, page: () => !!(root && cur), detach: () => { if (cur) { cur = null; if (root) render(); } },
    get state() { return { root: root && root.name, ro, cur: cur && { dir: pathArr(cur.dir).join('/'), node: cur.node && pathArr(cur.node).join('/') }, sel: sel && pathArr(sel).join('/'), rows: flat.map(n => pathArr(n).join('/')) }; },
  };
})();
