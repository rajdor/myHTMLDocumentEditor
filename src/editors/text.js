/* ---------- text editor (notebook only) ----------
   Plain text, data and code files open here and are saved back as themselves. The editing is CodeMirror 6, which is
   carried inside the program as text (#cm-src) and started the first time a text file is opened, so a notebook that
   only ever opens pages never runs it. The language is chosen by the file's extension.
   A file's bytes are respected: it is saved in the encoding it was read in (UTF-8, with or without a byte order mark,
   or UTF-16 with one) and with the line endings it had. A file that is not text in one of those encodings is shown
   read-only, so that saving cannot damage it.
   An editor is a plug-in of the notebook: it says which files it takes and answers open, content, restore and close. */
const TXT = (() => {
  /* language id (see vendor/codemirror.js), the name shown, and the extensions that pick it; '' is plain text */
  const TYPES = [
    ['json', 'JSON', 'json jsonc geojson gliffy ipynb'], ['xml', 'XML', 'xml xsd xsl xslt svg drawio csproj config plist'], ['css', 'CSS', 'css'],
    ['javascript', 'JavaScript', 'js mjs cjs'], ['jsx', 'JavaScript (JSX)', 'jsx'], ['typescript', 'TypeScript', 'ts mts cts'], ['tsx', 'TypeScript (TSX)', 'tsx'],
    ['python', 'Python', 'py pyw'], ['sql', 'SQL', 'sql'], ['yaml', 'YAML', 'yml yaml'], ['markdown', 'Markdown', 'md markdown'],
    ['shell', 'Shell', 'sh bash zsh'], ['powershell', 'PowerShell', 'ps1 psm1 psd1'], ['batch', 'Batch', 'bat cmd'],
    ['toml', 'TOML', 'toml'], ['properties', 'Properties', 'ini cfg conf properties env'], ['', 'Plain text', 'txt text log csv tsv gitignore gitattributes editorconfig']
  ];
  const BY_EXT = new Map(TYPES.flatMap(([id, name, exts]) => exts.split(' ').map(x => [x, { id, name }])));
  const extOf = name => { const s = String(name).toLowerCase(), i = s.lastIndexOf('.'); return i >= 0 ? s.slice(i + 1) : s; };
  const typeOf = name => BY_EXT.get(extOf(name)) || null;
  const MAX_COLOUR = 2 * 1048576, MAX_OPEN = 20 * 1048576;   // above the first a file opens without colouring; above the second it is not opened
  const host = $('#tx');
  let view = null, C = null, st = null, onChange = null;   // st: what is open { name, type, enc, ro, wrap }

  /* ----- bytes to text and back ----- */
  /* Returns { text (line breaks as \n), enc: { kind, bom, eol, mixed } }, or { error } when the bytes are not text this editor can save back. */
  function decode(buf) {
    const b = new Uint8Array(buf); let kind = 'utf-8', bom = false, off = 0;
    if (b[0] === 0xEF && b[1] === 0xBB && b[2] === 0xBF) { bom = true; off = 3; }
    else if (b[0] === 0xFF && b[1] === 0xFE) { kind = 'utf-16le'; bom = true; off = 2; }
    else if (b[0] === 0xFE && b[1] === 0xFF) { kind = 'utf-16be'; bom = true; off = 2; }
    let raw; try { raw = new TextDecoder(kind, { fatal: true, ignoreBOM: true }).decode(b.subarray(off)); } catch (e) { return { error: 'it is not UTF-8 or UTF-16 text' }; }
    if (raw.includes('\u0000')) return { error: 'it is not a text file' };
    const crlf = (raw.match(/\r\n/g) || []).length, lone = (raw.match(/\r(?!\n)/g) || []).length, lf = (raw.match(/\n/g) || []).length - crlf;
    const eol = crlf > lf && crlf >= lone ? '\r\n' : lone > lf ? '\r' : '\n', kinds = [crlf, lone, lf].filter(Boolean).length;
    return { text: raw.replace(/\r\n?/g, '\n'), enc: { kind, bom, eol, mixed: kinds > 1 } };
  }
  /* The bytes to write for text whose line breaks are \n. */
  function encode(text, enc) {
    const s = enc.eol === '\n' ? text : text.replace(/\n/g, enc.eol);
    if (enc.kind === 'utf-8') return new Blob([enc.bom ? new Uint8Array([0xEF, 0xBB, 0xBF]) : new Uint8Array(0), new TextEncoder().encode(s)]);
    const le = enc.kind === 'utf-16le', out = new Uint8Array(2 + s.length * 2), dv = new DataView(out.buffer); dv.setUint16(0, 0xFEFF, le);
    for (let i = 0; i < s.length; i++) dv.setUint16(2 + i * 2, s.charCodeAt(i), le);
    return new Blob([out]);
  }
  const encName = e => (e.kind === 'utf-8' ? 'UTF-8' : e.kind === 'utf-16le' ? 'UTF-16 LE' : 'UTF-16 BE') + (e.bom && e.kind === 'utf-8' ? ' with BOM' : '');
  const eolName = e => (e.eol === '\r\n' ? 'CRLF' : e.eol === '\r' ? 'CR' : 'LF') + (e.mixed ? ' (was mixed)' : '');

  /* ----- CodeMirror, started on first use ----- */
  let base = null, colours = null;
  function start() {
    if (!window.FLCM) { const s = document.createElement('script'); s.textContent = $('#cm-src').textContent; document.head.appendChild(s); }
    if (!window.FLCM) throw new Error('the text editor could not be started');
    const M = FLCM, t = M.tags;
    C = { lang: new M.Compartment(), wrap: new M.Compartment(), ro: new M.Compartment() };
    colours = M.HighlightStyle.define([
      { tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: '#6A7785', fontStyle: 'italic' },
      { tag: [t.keyword, t.controlKeyword, t.operatorKeyword, t.definitionKeyword, t.moduleKeyword, t.modifier], color: '#8E24AA' },
      { tag: [t.string, t.special(t.string), t.character, t.attributeValue], color: '#B23C0B' },
      { tag: [t.number, t.bool, t.null, t.atom, t.unit], color: '#0B6E4F' },
      { tag: [t.propertyName, t.attributeName, t.labelName], color: '#1F5FA8' },
      { tag: [t.typeName, t.className, t.namespace, t.tagName], color: '#12355B', fontWeight: '600' },
      { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName], color: '#7A4A0A' },
      { tag: [t.special(t.variableName), t.self, t.regexp, t.escape], color: '#C2185B' },
      { tag: [t.operator, t.punctuation, t.bracket, t.separator, t.angleBracket], color: '#4A5665' },
      { tag: [t.meta, t.processingInstruction, t.documentMeta], color: '#6A7785' },
      { tag: t.heading, color: '#12355B', fontWeight: '700' }, { tag: t.strong, fontWeight: '700' }, { tag: t.emphasis, fontStyle: 'italic' }, { tag: t.strikethrough, textDecoration: 'line-through' },
      { tag: [t.link, t.url], color: '#1F5FA8', textDecoration: 'underline' }, { tag: t.invalid, color: '#B00020' }
    ]);
    const look = M.EditorView.theme({
      '&': { height: '100%', fontSize: '13px', color: '#1c2b3a', backgroundColor: '#fff' }, '&.cm-focused': { outline: 'none' },
      '.cm-scroller': { fontFamily: "'JetBrains Mono', ui-monospace, Menlo, Consolas, monospace", lineHeight: '1.5' },
      '.cm-gutters': { backgroundColor: '#F7FAFD', color: '#8A96A3', borderRight: '1px solid #CFDBE8' }, '.cm-activeLineGutter': { backgroundColor: '#EAF1F8', color: '#12355B' },
      '.cm-activeLine': { backgroundColor: 'rgba(31, 95, 168, .05)' }, '.cm-selectionMatch': { backgroundColor: '#FFF3C4' },
      '.cm-panels': { backgroundColor: '#F6F9FC', color: '#12355B', borderTop: '1px solid #CFDBE8' }, '.cm-panels input, .cm-panels button': { font: 'inherit' }
    });
    base = [
      M.lineNumbers(), M.highlightActiveLineGutter(), M.highlightSpecialChars(), M.history(), M.foldGutter(), M.drawSelection(), M.rectangularSelection(), M.indentOnInput(), M.bracketMatching(),
      M.highlightActiveLine(), M.highlightSelectionMatches(), M.search({ top: false }), M.syntaxHighlighting(colours), look, M.EditorState.tabSize.of(4),
      M.keymap.of([...M.defaultKeymap, ...M.historyKeymap, ...M.searchKeymap, ...M.foldKeymap, M.indentWithTab]),
      M.EditorView.updateListener.of(u => { if (u.docChanged && onChange) onChange(); })
    ];
    view = new M.EditorView({ parent: host, state: M.EditorState.create({ doc: '' }) });
  }
  /* A fresh state for each file, so undo never reaches back into the file that was open before. */
  /* The indentation a file already uses: tabs, or the step of its space indents (2, 4 or 8). A file with none gets the usual
     step for its language. Tab and Enter then indent the way the file does. */
  const FOUR = ['python', 'powershell', 'batch', 'sql', 'shell'];
  function indentOf(text, type) {
    let tabs = 0; const steps = [];
    for (const l of text.split('\n', 20000)) { const m = l.match(/^([ \t]+)\S/); if (!m) continue; if (m[1][0] === '\t') tabs++; else if (!m[1].includes('\t')) steps.push(m[1].length); }
    if (tabs > steps.length) return '\t';
    for (const u of [8, 4, 2]) if (steps.length && steps.filter(w => w % u === 0).length >= steps.length * 0.9) return ' '.repeat(u);
    return ' '.repeat(FOUR.includes(type.id) ? 4 : 2);
  }
  const indentName = u => u === '\t' ? 'Tabs' : u.length + ' spaces';
  function stateFor(text) {
    const M = FLCM, lang = st.type.id && !st.plain && M.LANGS[st.type.id] ? M.LANGS[st.type.id]() : [];
    st.indent = indentOf(text, st.type);
    return M.EditorState.create({ doc: text, extensions: [base, M.indentUnit.of(st.indent), C.lang.of(lang), C.wrap.of(st.wrap ? M.EditorView.lineWrapping : []), C.ro.of(st.ro ? M.EditorState.readOnly.of(true) : [])] });
  }
  function barUI() {
    $('#x-kind').textContent = st.type.name; $('#x-name').textContent = st.name;
    $('#x-info').textContent = [encName(st.enc), eolName(st.enc), indentName(st.indent), st.plain ? 'too large to colour' : '', st.ro ? 'Read-only: ' + st.ro : ''].filter(Boolean).join(' | ');
    const w = $('[data-a="xwrap"]'); w.hidden = false; w.classList.toggle('on', st.wrap); w.setAttribute('aria-pressed', String(st.wrap)); $('[data-a="xfind"]').hidden = false;
  }
  /* Show a file. buf: its bytes. opts.as: a type to use in place of the one its extension gives; opts.changed: called on every edit.
     Returns '' or the reason the file was not opened. */
  function open(name, buf, opts) {
    if (buf.byteLength > MAX_OPEN) return 'it is larger than ' + (MAX_OPEN / 1048576) + ' MB';
    let d = decode(buf), ro = '';
    if (d.error) { ro = d.error + ', so it cannot be saved from here'; d = { text: new TextDecoder('windows-1252').decode(buf).replace(/\r\n?/g, '\n').replace(/\u0000/g, '�'), enc: { kind: 'utf-8', bom: false, eol: '\n', mixed: false } }; }
    return show(name, d.text, d.enc, ro, buf.byteLength, opts);
  }
  /* Show text already read (line breaks as \n), with the encoding it is to be saved in: a Markdown file switched to its source. */
  function openText(name, text, enc, opts) { return show(name, text, enc, '', text.length, opts); }
  function show(name, text, enc, ro, size, opts) {
    try { if (!view) start(); } catch (e) { return e.message; }
    st = { name, type: (opts && opts.as) || typeOf(name) || { id: '', name: 'Plain text' }, enc, ro, plain: size > MAX_COLOUR, wrap: st ? st.wrap : false, indent: '  ' };
    onChange = (opts && opts.changed) || null;
    view.setState(stateFor(text)); barUI(); view.scrollDOM.scrollTop = 0;
    return '';
  }
  const content = () => view.state.doc.toString();                       // line breaks as \n
  /* Put other text in place of what is shown (a copy from history); it counts as an edit and can be undone. */
  function restore(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: String(text).replace(/\r\n?/g, '\n') } }); }
  function close() { if (view && st) view.setState(FLCM.EditorState.create({ doc: '' })); st = null; onChange = null; }
  function wrap() { if (!st) return; st.wrap = !st.wrap; view.dispatch({ effects: C.wrap.reconfigure(st.wrap ? FLCM.EditorView.lineWrapping : []) }); barUI(); view.focus(); }
  /* Printing. The editor draws only the lines on screen, so for printing the whole file is laid out in #tx-print: every
     line, numbered, wrapped to the page, coloured as on screen (a file too large to colour prints plain). It is emptied after printing. */
  function printFill() {
    const out = $('#tx-print'); if (!out || !st) return; out.textContent = '';
    const M = FLCM, s = view.state, doc = s.doc, head = document.createElement('div'); head.className = 'txp-h';
    head.textContent = st.name + '  |  ' + st.type.name + '  |  ' + doc.lines + (doc.lines === 1 ? ' line' : ' lines') + '  |  printed ' + new Date().toLocaleString(); out.appendChild(head);
    const marks = [];   // [from, to, classes] for the coloured runs
    if (!st.plain && st.type.id) { const tree = M.ensureSyntaxTree(s, doc.length, 5000); if (tree) M.highlightTree(tree, colours, (from, to, cls) => marks.push([from, to, cls])); }
    const body = document.createElement('div'); body.className = 'txp-b'; let k = 0;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i), row = document.createElement('div'); row.className = 'txp-l'; let at = line.from;
      const put = (to, cls) => { if (to <= at) return; const t = doc.sliceString(at, to); if (cls) { const sp = document.createElement('span'); sp.className = cls; sp.textContent = t; row.appendChild(sp); } else row.appendChild(document.createTextNode(t)); at = to; };
      while (k < marks.length && marks[k][1] <= line.from) k++;
      for (let j = k; j < marks.length && marks[j][0] < line.to; j++) { const [f, e, c] = marks[j]; put(Math.max(f, line.from), null); put(Math.min(e, line.to), c); }
      put(line.to, null); if (!row.firstChild) row.appendChild(document.createTextNode('\u200b'));
      body.appendChild(row);
    }
    out.appendChild(body); out.style.setProperty('--tab', st.indent === '\t' ? 4 : st.indent.length);
  }
  function printClear() { const out = $('#tx-print'); if (out) out.textContent = ''; }
  return {
    printFill, printClear, indentOf,
    typeOf, decode, encode, open, openText, content, restore, close, wrap,
    info: () => st && { name: st.name, type: st.type.name, lang: st.type.id, enc: encName(st.enc), eol: eolName(st.enc), indent: indentName(st.indent), ro: st.ro, plain: st.plain, wrap: st.wrap },
    readOnly: () => !!(st && st.ro), rename: n => { if (st) { st.name = n; barUI(); } },
    undo: () => { FLCM.undo(view); view.focus(); }, redo: () => { FLCM.redo(view); view.focus(); }, find: () => { FLCM.openSearchPanel(view); }, focus: () => { if (view) view.focus(); },
    get view() { return view; }
  };
})();
