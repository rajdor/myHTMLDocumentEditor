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
    let rawHtml = false;
    /* The file's own markers are counted from what Markdown reads, so the markers this editor writes to keep touching
       lists apart (the second of two lists) and bold inside * emphasis (__) do not count as the file's style. */
    const bullets = { '-': 0, '*': 0, '+': 0 }, strongs = { '**': 0, '__': 0 };
    const walk = (ts, inEm) => { let prev = null; for (const t of ts || []) {
      if (t.type === 'html' && !/^<\/?(sup|sub|u|mark|kbd|br|em)\s*\/?>\s*$/i.test(t.raw.trim())) rawHtml = true;   // the tags kept are kept bare: one with attributes (a style, a class) counts as other HTML
      if (t.type === 'list' && !t.ordered && !(prev && prev.type === 'list' && !prev.ordered)) { const m = t.raw.trim()[0]; if (m in bullets) bullets[m] += t.items.length; }
      if (t.type === 'strong' && !inEm) { const m = t.raw.slice(0, 2); if (m in strongs) strongs[m]++; }
      if (t.type !== 'space') prev = t;
      const em = inEm || t.type === 'em';
      if (t.tokens) walk(t.tokens, em); if (t.items) walk(t.items, em); if (t.header) t.header.forEach(c => walk(c.tokens, em)); if (t.rows) t.rows.forEach(r => r.forEach(c => walk(c.tokens, em))); } };
    try { walk(marked.lexer(text, { gfm: true }), false); } catch (e) { }
    { const b = Object.entries(bullets).sort((x, y) => y[1] - x[1])[0]; style.bullet = b[1] ? b[0] : '-'; style.strong = strongs['__'] > strongs['**'] ? '__' : '**'; }
    const t = document.createElement('template'), c = t.content;
    t.innerHTML = marked.parse(text, { gfm: true });
    $$('pre > code', c).forEach(k => { const p = k.parentNode, l = (k.className.match(/language-(\S+)/) || [])[1]; p.textContent = (/\n\n$/.test(k.textContent) ? k.textContent : k.textContent.replace(/\n$/, '')).replace(/^\n/, '\n\n');   /* a last line left blank stays: a code block draws a blank last line only with two line breaks */   /* HTML drops one line break straight after <pre> */ if (l) p.setAttribute('data-lang', l); });   // the editor's code block is a plain pre
    $$('sup,sub,u,mark,kbd,em', c).forEach(e => [...e.attributes].forEach(a => e.removeAttribute(a.name)));   // styling written into the file is not drawn in the editor
    $$('li', c).forEach(li => { if (!li.textContent.trim() && !li.querySelector('img,ul,ol,input,br')) li.appendChild(document.createElement('br')); });   // an empty item stays an item
    $$('a img', c).forEach(i => { i.setAttribute('data-md-src', i.getAttribute('src') || ''); i.setAttribute('src', ''); });   // a picture inside a link stays a picture; it is shown when it is in the notebook folder
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
  /* Two lists of the same kind one after the other are read back as one list in Markdown, so every second one in a run
     is written with the other marker (* for -, ) for .), which keeps them apart. Returns how many lists of its kind
     come straight before this one. */
  const written = L => [...L.children].some(li => li.textContent.replace(/[\s\u00a0\u200b]+/g, '') || li.querySelector('img'));   // a list of only empty items is not written
  const blank = x => !x.textContent.replace(/[\s\u00a0\u200b]+/g, '') && !x.querySelector('img,hr,table,input') && !/^(HR|TABLE|PRE)$/.test(x.tagName);   // writes nothing, so does not keep lists apart
  function touching(L) { let k = 0, x = L.previousElementSibling; while (x && blank(x)) x = x.previousElementSibling; for (; x && x.tagName === L.tagName; ) { if (written(x)) k++; else break; x = x.previousElementSibling; while (x && blank(x)) x = x.previousElementSibling; } return k; }
  function service(style) {
    const s = new TurndownService({ headingStyle: 'atx', hr: '---', bulletListMarker: style.bullet, codeBlockStyle: 'fenced', preformattedCode: true, emDelimiter: style.em, strongDelimiter: style.strong, linkStyle: 'inlined', blankReplacement: (c, n) => n.nodeName === 'PRE' ? '\n\n```' + (n.getAttribute('data-lang') || '') + '\n```\n\n' : n.isBlock ? '\n\n' : ''   /* an empty code block is kept */ });
    s.escape = escape;
    s.keep(KEEP_INLINE);
    s.addRule('editorOnly', { filter: n => n.nodeType === 1 && (n.matches('.dg, .fig, .note-log, .ed-handle, input, style, script, nav')), replacement: () => '' });
    const noLead = c => c.replace(/^(\s*\d+)\\([.)]\s)/, '$1$2').replace(/^(\s*)\\([-+*>]\s)/, '$1$2').replace(/^(\s*)\\(#)/, '$1$2');   // at the start of a heading or a table cell these are only characters
    s.addRule('heading', { filter: n => /^H[1-4]$/.test(n.nodeName) && !n.hasAttribute('data-md-h'), replacement: (c, n) => c.trim() ? '\n\n' + '#'.repeat(+n.nodeName[1]) + ' ' + noLead(c.trim()).replace(/\s*\n\s*/g, ' ') + '\n\n' : '' });
    s.addRule('quote', { filter: 'blockquote', replacement: c => '\n\n' + c.replace(/^\n+|\n+$/g, '').replace(/^/gm, '> ').replace(/^> $/gm, '>') + '\n\n' });
    s.addRule('emptyPara', { filter: n => n.nodeName === 'P' && !n.textContent.replace(/[\s\u00a0\u200b]+/g, '') && !n.querySelector('img, a'), replacement: () => '' });   // an empty line left for typing is not written
    /* A line break at the very end of a block shows nothing and would be written as two stray spaces. */
    const edgeBreak = n => {  const b = n.parentElement && n.parentElement.closest('p,li,td,th,h1,h2,h3,h4,h5,h6,dd,dt,blockquote'); if (!b) return false; const r = document.createRange(), q = document.createRange(); q.setStart(b, 0); q.setEndBefore(n); if (!q.toString().replace(/[\s\u00a0\u200b]+/g, '') && !q.cloneContents().querySelector('img')) return true; /* or nothing before the next block in it */ { let x = n; for (;;) { let k = x.nextSibling; while (k && k.nodeType === 3 && !k.data.replace(/[\s\u00a0]+/g, '')) k = k.nextSibling; if (k) { if (k.nodeType === 1 && /^(P|UL|OL|PRE|TABLE|DIV|BLOCKQUOTE|H[1-6]|HR|DL)$/.test(k.nodeName)) return true; break; } if (x.parentNode === b || !x.parentNode) break; x = x.parentNode; } } r.setStartAfter(n); r.setEnd(b, b.childNodes.length); return !r.toString().replace(/[\s\u00a0\u200b]+/g, '') && !r.cloneContents().querySelector('img');  };
    s.addRule('endBreak', { filter: n => n.nodeName === 'BR' && !n.closest('td,th') && edgeBreak(n), replacement: () => '' });
    /* Emphasis inside a word is written with * (_ cannot start or end emphasis inside a word), and bold inside * emphasis
       with __, which Markdown readers otherwise confuse with the * around it. */
    const word = (n, after) => { let x = n; while (x && !(after ? x.nextSibling : x.previousSibling) && x.parentNode && !/^(P|LI|TD|TH|H[1-6]|DD|DT|BLOCKQUOTE|DIV)$/.test(x.parentNode.nodeName)) x = x.parentNode; const k = x && (after ? x.nextSibling : x.previousSibling); const ch = k ? (after ? k.textContent[0] : k.textContent.slice(-1)) : ''; return !!ch && /[\p{L}\p{N}]/u.test(ch); };
    /* Spaces at either end of emphasis go outside it (typed spaces are often non-breaking ones), or Markdown would not read it as emphasis. */
    const wrap = (c, d) => { const m = c.match(/^([\s\u00a0]*)([\s\S]*?)([\s\u00a0]*)$/); return m[2] ? m[1] + d + m[2] + d + m[3] : c; };
    const intraStrong = n => [...n.querySelectorAll('b,strong')].some(b => word(b, false) || word(b, true));
    s.addRule('em', { filter: ['em', 'i'], replacement: (c, n) => { if (!c.trim()) return c; const inWord = word(n, false) || word(n, true); if (inWord && intraStrong(n)) return '<em>' + c + '</em>';   /* inside a word with bold inside a word too: no Markdown marker can say it, so HTML does */ const d = inWord ? '*' : intraStrong(n) ? '_' : (style.em === '_' && n.querySelector('b,strong') && style.strong === '__') ? '*' : style.em; return wrap(c, d); } });   /* emphasis holding bold inside a word is written with _, which keeps the two apart */
    s.addRule('strong', { filter: ['strong', 'b'], replacement: (c, n) => { if (!c.trim()) return c; const inEm = !!n.parentElement && !!n.parentElement.closest('em,i'), intra = word(n, false) || word(n, true); const em = inEm && n.parentElement.closest('em,i'), emD = em ? (word(em, false) || word(em, true) ? (intraStrong(em) ? 'html' : '*') : intraStrong(em) ? '_' : style.em) : ''; const d = intra ? '**' : emD === '*' ? '__' : emD === '_' ? '**' : style.strong; return wrap(c, d); } });
    /* Two line breaks in a row: the second is written with a backslash, since a line of only spaces would end the paragraph. */
    s.addRule('breaks', { filter: n => { if (n.nodeName !== 'BR' || n.closest('td,th') || edgeBreak(n)) return false; let p = n.previousSibling; while (p && p.nodeType === 3 && !p.data.replace(/[\s\u00a0]+/g, '')) p = p.previousSibling; return !!p && p.nodeName === 'BR'; }, replacement: () => '\\\n' });
    s.addRule('link', { filter: n => n.nodeName === 'A' && n.getAttribute('href') && !n.classList.contains('link-card'), replacement: (c, n) => { const m = c.match(/^([\s\u00a0]*)([\s\S]*?)([\s\u00a0]*)$/), href = n.getAttribute('href').replace(/([()])/g, '\\$1').replace(/ /g, '%20'), title = n.getAttribute('title'); return m[1] + '[' + m[2] + '](' + href + (title ? ' "' + title.replace(/"/g, '\\"') + '"' : '') + ')' + m[3]; } });
    s.addRule('strike', { filter: ['s', 'del', 'strike'], replacement: c => c.trim() ? wrap(c, '~~') : c });
    s.addRule('deepHeading', { filter: n => n.nodeName === 'H4' && /^[56]$/.test(n.getAttribute('data-md-h') || ''), replacement: (c, n) => c.trim() ? '\n\n' + '#'.repeat(+n.getAttribute('data-md-h')) + ' ' + c.trim() + '\n\n' : '' });
    const preText = n => { let t = ''; const walk = x => x.childNodes.forEach(k => { if (k.nodeType === 3) t += k.data; else if (k.nodeName === 'BR') t += '\n'; else if (k.nodeType === 1) walk(k); }); walk(n); return t; };   // a line break in a code block is a new line
    s.addRule('inlineCode', { filter: n => n.nodeName === 'CODE' && !(n.parentNode.nodeName === 'PRE' && !n.previousSibling && !n.nextSibling), replacement: (c, n) => {   // code holds plain text in Markdown: formatting inside it is not written as markers
      const text = n.textContent.replace(/\r?\n|\r/g, ' '); if (!text) return ''; const runs = text.match(/`+/g) || []; let f = '`'; while (runs.includes(f)) f += '`';
      const pad = /^`|`$/.test(text) || (/^ | $/.test(text) && /[^ ]/.test(text)) ? ' ' : ''; return f + pad + text + pad + f; } });
    s.addRule('codeBlock', { filter: 'pre', replacement: (c, n) => { let text = preText(n).replace(/\n$/, ''); if (!text.replace(/\n/g, '')) text = '';   /* blank lines only: an empty code block */ const f = fence(text, '`'); return '\n\n' + f + (n.getAttribute('data-lang') || '') + '\n' + (text ? text + '\n' : '') + f + '\n\n'; } });
    s.addRule('localImage', { filter: n => n.nodeName === 'IMG' && n.hasAttribute('data-md-src'), replacement: (c, n) => { const t = n.getAttribute('title'); return '![' + escape(n.getAttribute('alt') || '') + '](' + n.getAttribute('data-md-src').replace(/([()])/g, '\\$1').replace(/ /g, '%20') + (t ? ' "' + t.replace(/"/g, '\\"') + '"' : '') + ')'; } });   // a picture from the notebook folder: its own path, not the address it is shown from
    s.addRule('card', { filter: n => n.nodeName === 'A' && n.classList.contains('link-card'), replacement: (c, n) => { const img = n.getAttribute('data-kind') === 'image', b = n.querySelector('b'), l = b ? b.textContent.trim() : '', url = (n.getAttribute('href') || '').replace(/([()])/g, '\\$1').replace(/ /g, '%20'); return (img ? '!' : '') + '[' + (img && /^image$/i.test(l) ? '' : escape(l)) + '](' + url + ')'; } });
    s.addRule('item', { filter: 'li', replacement: (c, n) => {
      const p = n.parentNode, box = p.nodeName === 'UL' && p.classList.contains('check') ? n.querySelector(':scope > input[type=checkbox]') : null;
      const st = parseInt(p.getAttribute('start'), 10), alt = touching(p) % 2 === 1;
      const mark = p.nodeName === 'OL' ? ((isNaN(st) ? 1 : st) + [...p.children].slice(0, [...p.children].indexOf(n)).filter(li => li.textContent.replace(/[\s\u00a0\u200b]+/g, '') || li.querySelector('img')).length) + (alt ? ') ' : '. ') : (alt ? (style.bullet === '*' ? '-' : '*') : style.bullet) + ' ';
      if (!c.replace(/[\s\u00a0\u200b]+/g, '') && !n.querySelector('img')) return '';   // an empty item is not written: Markdown cannot always hold one (after a line of text it reads as a heading underline)
      const loose = [...p.children].some(li => li.querySelector(':scope > p'));   // a list written with blank lines between its items keeps them
      if (!loose) c = c.replace(/\n{2,}(?=[ ]*(?:[-*+]|\d+[.)]) )/g, '\n');   // in a tight list an inner list follows its item's line directly
      c = c.replace(/^\n+/, '').replace(/^[ \u00a0]+/, '').replace(/\n+$/, '').replace(/\n/g, '\n' + ' '.repeat(mark.length)).replace(/\n +(?=\n)/g, '\n');
      const first = n.firstElementChild && n.firstElementChild.tagName === 'INPUT' ? n.firstElementChild.nextElementSibling : n.firstElementChild;
      if (first && /^(UL|OL)$/.test(first.tagName) && !n.textContent.slice(0, n.textContent.indexOf(first.textContent)).trim() && /^[-*+] |^\d+[.)] /.test(c)) return mark.trimEnd() + '\n' + ' '.repeat(mark.length) + c + (n.nextElementSibling ? (loose ? '\n\n' : '\n') : '');   // an item that starts with its inner list: the list goes on the next line (a tick box cannot be kept there)
      return (c || box ? mark : mark.trimEnd()) + (box ? (box.checked ? '[x] ' : '[ ] ').trimEnd() + (c ? ' ' : '') : '') + c + (n.nextElementSibling ? (loose ? '\n\n' : '\n') : '');
    } });
    s.addRule('table', { filter: 'table', replacement: (c, n) => {
      const rows = [...n.rows]; if (!rows.length) return '';
      const cell = x => { const k = x.cloneNode(true); k.querySelectorAll('input').forEach(i => i.remove()); k.querySelectorAll('h1,h2,h3,h4,h5,h6,p,pre').forEach(b => { const w = document.createElement(b.tagName === 'PRE' ? 'code' : 'span'); w.append(...b.childNodes); b.replaceWith(w, document.createElement('br')); });   /* a table cell holds lines: headings, paragraphs and code blocks in it become plain lines (code inline) */ k.querySelectorAll('br').forEach(b => b.replaceWith('\u2028')); return s.turndown('<div>' + k.innerHTML + '</div>').replace(/[ \t]*\n+[ \t]*/g, '\u2028').split('\u2028').map(noLead).join('<br>').replace(/^(<br>)+|(<br>)+$/g, '').replace(/\|/g, '\\|').trim(); };   /* each line of a cell: a list or heading marker at its start is only characters there */
      const grid = rows.map(r => [...r.cells].map(cell)), w = Math.max(...grid.map(r => r.length)), line = r => '| ' + Array.from({ length: w }, (_, i) => r[i] || '').join(' | ') + ' |';
      const al = Array.from({ length: w }, (_, i) => { const x = rows[0].cells[i], a = x ? (x.getAttribute('align') || x.style.textAlign || '') : ''; return a === 'center' ? ':---:' : a === 'right' ? '---:' : a === 'left' ? ':---' : '---'; });
      return '\n\n' + [line(grid[0]), '| ' + al.join(' | ') + ' |', ...grid.slice(1).map(line)].join('\n') + '\n\n';
    } });
    return s;
  }
  /* The editor content (a cleaned copy of the document element) to Markdown text, line breaks as \n, ending in one. */
  function write(root, meta) {
    root.normalize();   // one text node per run of text, so what is escaped at the start of a line is seen whole
    let body = service(meta.style).turndown(root).trim();
    /* Outside code blocks: spaces left at the end of a line that are not a line break (one space, or non-breaking ones) go,
       and a divider at the very start is written *** so that it cannot be read as the start of front matter. */
    { let inCode = false; body = body.split('\n').map(l => { if (/^ {0,3}(`{3,}|~{3,})/.test(l)) { inCode = !inCode; return l; } if (inCode) return l; return /[ \u00a0]$/.test(l) && !/[^ \u00a0] {2}$/.test(l) ? l.replace(/[ \u00a0]+$/, '') : l; }).join('\n'); }
    if (!meta.fm && /^---\s*(\n|$)/.test(body)) body = '***' + body.slice(3);
    return (meta.fm || '') + (meta.fm ? meta.gap : '') + body + '\n';
  }
  /* What is in the document that a Markdown file cannot keep, in words; empty when everything can be kept. */
  function lost(root, meta) {
    const n = sel => root.querySelectorAll(sel).length, out = [], add = (k, one, many, what) => { if (k) out.push((k === 1 ? one : k + ' ' + many) + ' (' + what + ')'); };
    add(n('.dg, .fig'), '1 diagram', 'diagrams', 'left out');
    add(n('a:not([href]):not(.link-card)'), '1 link to an address that is not allowed, such as javascript:,', 'links to addresses that are not allowed, such as javascript:,', 'saved as plain text');
    add(n('.box'), '1 box', 'boxes', 'saved as plain paragraphs'); add(n('.note'), '1 margin note', 'margin notes', 'the note is left out');
    add(n('span.id'), '1 ID tag', 'ID tags', 'saved as plain text'); add(n('dl'), '1 Q&A list', 'Q&A lists', 'saved as plain paragraphs');
    add(n('td[colspan], td[rowspan], th[colspan], th[rowspan]'), '1 merged cell', 'merged cells', 'saved unmerged');
    add(n('p.sub, p.h2sub, p.bluf, p.cap'), '1 styled paragraph', 'styled paragraphs', 'saved as plain paragraphs');
    add([...root.querySelectorAll('code')].filter(c => !c.closest('pre') && c.querySelector('b,strong,i,em,s,del,strike,a,sup,sub,u,mark')).length, '1 piece of inline code with formatting inside', 'pieces of inline code with formatting inside', 'saved as plain code');
    add([...root.querySelectorAll('td ul, td ol, th ul, th ol')].length, '1 list in a table cell', 'lists in table cells', 'saved as lines of text');
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
