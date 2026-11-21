/* ---------- Markdown editor (notebook only) ----------
   A Markdown file opens in the same WYSIWYG editor as a page and is saved back as Markdown. It is a profile of the page
   editor, not a copy of it: reading turns the Markdown into the editor's content (marked), writing turns the content
   back into Markdown (Turndown, with rules for the editor's own tables, checklists, code blocks and link cards), and
   while a Markdown file is open the toolbar commands for things Markdown cannot hold are switched off.
   Kept as they were: front matter (to the byte), the bullet character, the emphasis character, a code block's language,
   heading levels 5 and 6, and inline HTML for superscript, subscript, underline, highlight and keys.
   Not kept: line wrapping inside a paragraph, reference-style links (they become inline links), and other HTML written
   inside the file. The file is otherwise rewritten in one consistent style. */
const MD = (() => {
  const KEEP_INLINE = ['sup', 'sub', 'u', 'mark', 'kbd'];
  /* commands and styles that make something Markdown cannot hold */
  const OFF_ACTIONS = ['tag', 'diagram', 'note', 'margin', 'stage', 'mr', 'md', 'split', 'hr', 'sr', 'hc', 'sc', 'dense', 'ldense', 'qa', 'index', 'blocks'];   // index and blocks: a Markdown file has no index, and no containers from elsewhere
  const OFF_STYLES = ['p.sub', 'p.h2sub', 'p.bluf', 'p.cap', 'dt', 'dd'], OFF_FORMATS = ['sup', 'sub'];
  const WHY = ' (not available in a Markdown file)';
  let on = false;

  /* ----- reading ----- */
  /* Markdown text (line breaks as \n) to { html, fm, gap, style, html5 }: the editor content, the front matter exactly as written,
     the blank lines after it, the file's own bullet and emphasis characters, and whether HTML in the file will not be kept. */
  function read(text) {
    let fm = '', gap = '';
    const m = text.match(/^---\n[\s\S]*?\n---[ \t]*(?:\n|$)/);
    if (m) { fm = m[0]; text = text.slice(fm.length); gap = text.match(/^\n*/)[0]; text = text.slice(gap.length); }
    const count = re => (text.match(re) || []).length;
    const style = { bullet: ['-', '*', '+'].map(b => [b, count(new RegExp('^[ \\t]*\\' + b + '[ \\t]+\\S', 'gm'))]).sort((a, b) => b[1] - a[1])[0], em: count(/(^|[\s(])_[^_\s][^_\n]*_(?=[\s).,;:!?]|$)/gm) > count(/(^|[^*\\])\*[^*\s][^*\n]*\*(?!\*)/gm) ? '_' : '*', strong: count(/__[^_\n]+__/g) > count(/\*\*[^*\n]+\*\*/g) ? '__' : '**' };
    style.bullet = style.bullet[1] ? style.bullet[0] : '-';
    let rawHtml = false;
    const walk = ts => { for (const t of ts || []) { if (t.type === 'html' && !/^<\/?(sup|sub|u|mark|kbd|br)\b[^>]*>\s*$/i.test(t.raw.trim())) rawHtml = true; if (t.tokens) walk(t.tokens); if (t.items) walk(t.items); if (t.header) t.header.forEach(c => walk(c.tokens)); if (t.rows) t.rows.forEach(r => r.forEach(c => walk(c.tokens))); } };
    try { walk(marked.lexer(text, { gfm: true })); } catch (e) { }
    const t = document.createElement('template'), c = t.content;
    t.innerHTML = marked.parse(text, { gfm: true });
    $$('pre > code', c).forEach(k => { const p = k.parentNode, l = (k.className.match(/language-(\S+)/) || [])[1]; p.textContent = k.textContent.replace(/\n$/, ''); if (l) p.setAttribute('data-lang', l); });   // the editor's code block is a plain pre
    $$('h5, h6', c).forEach(h => { const n = document.createElement('h4'); n.setAttribute('data-md-h', h.tagName[1]); n.append(...h.childNodes); h.replaceWith(n); });
    $$('li input[type=checkbox]', c).forEach(i => { const li = i.closest('li'), ul = li.parentNode; if (ul.nodeName !== 'UL') { i.remove(); return; } ul.classList.add('check'); i.removeAttribute('disabled'); const p = i.parentNode; li.prepend(i); if (p !== li && p.nodeName === 'P') p.replaceWith(...p.childNodes); });
    $$('ul.check > li', c).forEach(li => { if (!$(':scope > input[type=checkbox]', li)) { const i = document.createElement('input'); i.type = 'checkbox'; li.prepend(i); } const x = li.childNodes[1]; if (x && x.nodeType === 3) x.data = x.data.replace(/^\s+/, ''); });
    $$('table', c).forEach(tb => { if (!tb.parentNode.matches || !tb.parentNode.matches('div.tw')) { const w = document.createElement('div'); w.className = 'tw'; tb.replaceWith(w); w.appendChild(tb); } });
    if (!c.firstElementChild) t.innerHTML = '<p><br></p>';
    return { html: t.innerHTML, fm, gap, style, rawHtml };
  }

  /* ----- writing ----- */
  /* Only what would otherwise be read as Markdown is escaped, so ordinary words (snake_case, array[0]) are left as typed. */
  function escape(s) {
    return s.replace(/\\(?=[!-\/:-@\[-`{-~]|$)/g, '\\\\').replace(/\*(?=\S)|(?<=\S)\*/g, '\\*').replace(/`/g, '\\`').replace(/~~/g, '\\~~')
      .replace(/(^|[^A-Za-z0-9])_(?=\S)/g, '$1\\_').replace(/(\S)_(?![A-Za-z0-9])/g, '$1\\_')
      .replace(/\[(?=[^\]\n]*\](?:\(|\[|:))/g, '\\[').replace(/\](?=\(|\[|:)/g, '\\]')
      .replace(/<(?=[A-Za-z\/!?])/g, '\\<').replace(/&(?=#?[A-Za-z0-9]+;)/g, '\\&')
      .replace(/^(\s*)(#{1,6}\s)/, '$1\\$2').replace(/^(\s*)>/, '$1\\>').replace(/^(\s*)([-+*])(\s)/, '$1\\$2$3').replace(/^(\s*\d+)([.)]\s)/, '$1\\$2').replace(/^(\s*)(=+|-{3,}|_{3,})\s*$/, '$1\\$2').replace(/^(\s*)\[([ xX])\]/, '$1\\[$2]');
  }
  const fence = (text, ch) => { let n = 3; for (const r of text.match(new RegExp(ch + '{3,}', 'g')) || []) n = Math.max(n, r.length + 1); return ch.repeat(n); };
  function service(style) {
    const s = new TurndownService({ headingStyle: 'atx', hr: '---', bulletListMarker: style.bullet, codeBlockStyle: 'fenced', emDelimiter: style.em, strongDelimiter: style.strong, linkStyle: 'inlined' });
    s.escape = escape;
    s.keep(KEEP_INLINE);
    s.addRule('editorOnly', { filter: n => n.nodeType === 1 && (n.matches('.dg, .fig, .note-log, .ed-handle, input, style, script, nav')), replacement: () => '' });
    const noLead = c => c.replace(/^(\s*\d+)\\([.)]\s)/, '$1$2').replace(/^(\s*)\\([-+>])/, '$1$2');   // at the start of a heading or a table cell these are only characters
    s.addRule('heading', { filter: n => /^H[1-4]$/.test(n.nodeName) && !n.hasAttribute('data-md-h'), replacement: (c, n) => c.trim() ? '\n\n' + '#'.repeat(+n.nodeName[1]) + ' ' + noLead(c.trim()).replace(/\s*\n\s*/g, ' ') + '\n\n' : '' });
    s.addRule('quote', { filter: 'blockquote', replacement: c => '\n\n' + c.replace(/^\n+|\n+$/g, '').replace(/^/gm, '> ').replace(/^> $/gm, '>') + '\n\n' });
    s.addRule('emptyPara', { filter: n => n.nodeName === 'P' && !n.textContent.replace(/[\s\u00a0\u200b]+/g, '') && !n.querySelector('img, a'), replacement: () => '' });   // an empty line left for typing is not written
    s.addRule('strike', { filter: ['s', 'del', 'strike'], replacement: c => c.trim() ? '~~' + c + '~~' : '' });
    s.addRule('deepHeading', { filter: n => n.nodeName === 'H4' && /^[56]$/.test(n.getAttribute('data-md-h') || ''), replacement: (c, n) => c.trim() ? '\n\n' + '#'.repeat(+n.getAttribute('data-md-h')) + ' ' + c.trim() + '\n\n' : '' });
    s.addRule('codeBlock', { filter: 'pre', replacement: (c, n) => { const text = n.textContent.replace(/\n$/, ''), f = fence(text, '`'); return '\n\n' + f + (n.getAttribute('data-lang') || '') + '\n' + text + '\n' + f + '\n\n'; } });
    s.addRule('card', { filter: n => n.nodeName === 'A' && n.classList.contains('link-card'), replacement: (c, n) => { const img = n.getAttribute('data-kind') === 'image', b = n.querySelector('b'), l = b ? b.textContent.trim() : '', url = (n.getAttribute('href') || '').replace(/([()])/g, '\\$1').replace(/ /g, '%20'); return (img ? '!' : '') + '[' + (img && /^image$/i.test(l) ? '' : escape(l)) + '](' + url + ')'; } });
    s.addRule('item', { filter: 'li', replacement: (c, n) => {
      const p = n.parentNode, box = p.nodeName === 'UL' && p.classList.contains('check') ? n.querySelector(':scope > input[type=checkbox]') : null;
      const mark = p.nodeName === 'OL' ? ((parseInt(p.getAttribute('start'), 10) || 1) + [...p.children].indexOf(n)) + '. ' : style.bullet + ' ';
      c = c.replace(/^\n+/, '').replace(/\n+$/, '').replace(/\n/g, '\n' + ' '.repeat(mark.length));
      const loose = [...p.children].some(li => li.querySelector(':scope > p'));   // a list written with blank lines between its items keeps them
      return mark + (box ? (box.checked ? '[x] ' : '[ ] ') : '') + c + (n.nextElementSibling ? (loose ? '\n\n' : '\n') : '');
    } });
    s.addRule('table', { filter: 'table', replacement: (c, n) => {
      const rows = [...n.rows]; if (!rows.length) return '';
      const cell = x => { const k = x.cloneNode(true); k.querySelectorAll('input').forEach(i => i.remove()); return noLead(s.turndown('<div>' + k.innerHTML + '</div>')).replace(/[ \t]*\n+[ \t]*/g, '<br>').replace(/\|/g, '\\|').trim(); };
      const grid = rows.map(r => [...r.cells].map(cell)), w = Math.max(...grid.map(r => r.length)), line = r => '| ' + Array.from({ length: w }, (_, i) => r[i] || '').join(' | ') + ' |';
      const al = Array.from({ length: w }, (_, i) => { const x = rows[0].cells[i], a = x ? (x.getAttribute('align') || x.style.textAlign || '') : ''; return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'; });
      return '\n\n' + [line(grid[0]), '| ' + al.join(' | ') + ' |', ...grid.slice(1).map(line)].join('\n') + '\n\n';
    } });
    return s;
  }
  /* The editor content (a cleaned copy of the document element) to Markdown text, line breaks as \n, ending in one. */
  function write(root, meta) {
    const body = service(meta.style).turndown(root).trim();
    return (meta.fm || '') + (meta.fm ? meta.gap : '') + body + '\n';
  }
  /* What is in the document that a Markdown file cannot keep, in words; empty when everything can be kept. */
  function lost(root, meta) {
    const n = sel => root.querySelectorAll(sel).length, out = [], add = (k, one, many, what) => { if (k) out.push((k === 1 ? one : k + ' ' + many) + ' (' + what + ')'); };
    add(n('.dg, .fig'), '1 diagram', 'diagrams', 'left out');
    add(n('.box'), '1 box', 'boxes', 'saved as plain paragraphs'); add(n('.note'), '1 margin note', 'margin notes', 'the note is left out');
    add(n('span.id'), '1 ID tag', 'ID tags', 'saved as plain text'); add(n('dl'), '1 Q&A list', 'Q&A lists', 'saved as plain paragraphs');
    add(n('td[colspan], td[rowspan], th[colspan], th[rowspan]'), '1 merged cell', 'merged cells', 'saved unmerged');
    add(n('p.sub, p.h2sub, p.bluf, p.cap'), '1 styled paragraph', 'styled paragraphs', 'saved as plain paragraphs');
    if (meta && meta.rawHtml) out.push('HTML written inside the file (not kept, apart from superscript, subscript, underline, highlight and keys)');
    return out;
  }

  /* ----- the profile: commands for things Markdown cannot hold are switched off while a Markdown file is open ----- */
  function profile(want) {
    want = !!want; if (want === on) return; on = want;
    document.documentElement.classList.toggle('md-mode', on);
    const set = (e, off) => { if (!e) return; if (off) { if (e.dataset.mdTitle === undefined) e.dataset.mdTitle = e.title || ''; e.disabled = true; if (e.title !== undefined && e.tagName !== 'OPTION') e.title = e.dataset.mdTitle + WHY; } else if (e.dataset.mdTitle !== undefined) { e.disabled = false; if (e.tagName !== 'OPTION') e.title = e.dataset.mdTitle; delete e.dataset.mdTitle; } };
    OFF_ACTIONS.forEach(a => set($('#tbar [data-a="' + a + '"]'), on));
    set($('#s-boxtype'), on);
    OFF_STYLES.forEach(v => set($('#s-block option[value="' + v + '"]'), on)); OFF_FORMATS.forEach(v => set($('#s-fmt option[value="' + v + '"]'), on));
  }
  return { read, write, lost, profile, escape, on: () => on };
})();
