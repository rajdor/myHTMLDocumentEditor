// Markdown files: a .md file opens in the WYSIWYG editor and is saved back as Markdown, in place. What the file had
// is kept (front matter, bullet and emphasis characters, code languages, deep headings, encoding, line endings);
// toolbar commands for things Markdown cannot hold are switched off; anything that still cannot be kept is named
// before it is saved. History and the prompts work as they do for pages.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
const { b, pg, errors, dialogs } = await open({ prompt: '2,1' });
await pg.evaluate(installMockFs);
const q = (f, ...a) => pg.evaluate(f, ...a);
const row = (p) => '.nb-row[title="' + p + '"]';
const state = () => q(() => FLE.NB.state);
const paths = () => q(() => MFS.paths(R));
const text = (p) => q((p) => MFS.text(R, p), p);
const bytes = (p) => q((p) => MFS.bytes(R, p), p);
const msg = () => q(() => document.querySelector('#nb-msg').textContent);
const dirty = () => q(() => document.querySelector('[data-a="save"]').classList.contains('has'));
const clickRow = async (p) => { await pg.click(row(p)); await sleep(280); };
const touch = async () => { await q(() => document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true }))); await sleep(40); };
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(400); };
const menu = async (p, item) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const ok = await q((item) => { const x = [...document.querySelectorAll('#nb-menu button')].find(k => k.textContent === item); if (x) x.click(); return !!x; }, item); await sleep(350); return ok; };
const caret = async (sel, end = true) => { await q((s, end) => { const c = document.querySelector(s), r = document.createRange(); r.selectNodeContents(c); r.collapse(!end); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); }, sel, end); await sleep(40); };

/* Files that must come back exactly as they were when opened, touched and saved. */
const SAME = {
  basic: '# Title\n\nA paragraph with *em*, **strong**, `code`, ~~strike~~ and a [link](https://example.com/a_b).\n\n## Section\n\nSecond paragraph.\n',
  'front matter': '---\ntitle: "T"\ntags:\n  - a\n---\n\n# T\n\nBody.\n',
  'front matter, no gap': '---\na: 1\n---\nBody right after.\n',
  lists: '- one\n- two\n  - nested a\n  - nested b\n- three\n\n1. first\n2. second\n   1. inner\n3. third\n',
  'list start': '3. three\n4. four\n',
  'star bullets': '* one\n* two\n\nSome _em_ and __strong__.\n',
  tasks: '- [ ] todo\n- [x] done with **bold**\n',
  'loose list': '- one\n\n- two\n\n- three\n',
  table: '| Name | Qty | Note |\n| --- | ---: | :---: |\n| a\\|b | 1 | x |\n| c | 2 |  |\n',
  code: '```python\ndef f():\n    return "*not em*"\n\n\n# done\n```\n\n```\nplain\n```\n',
  'code holding a fence': '````\n```\ninner\n```\n````\n',
  quote: '> quoted line\n>\n> second para\n',
  rule: 'above\n\n---\n\nbelow\n',
  'deep headings': '### Three\n\n#### Four\n\n##### Five\n\n###### Six\n',
  'ordinary characters': 'snake_case, array[0], 2 * 3 = 6, a < b, AT&T, C:\\path, #notheading, 1.5 items, x_y_z and (parens).\n',
  escapes: '\\*not em\\*, \\_no\\_ and \\[not link\\](x).\n\n\\* not a bullet\n\n1\\. not a list\n',
  'line break': 'line one  \nline two\n',
  images: '![Alt text](img/pic.png)\n\n![](https://example.com/p.png)\n',
  'inline html kept': 'H<sub>2</sub>O and x<sup>2</sup> and <kbd>Ctrl</kbd>.\n',
  'typed heading number': '## 1. Numbered heading\n\nText.\n',
};
/* Files that are rewritten in the one style: [as opened, as saved]. */
const TIDY = {
  setext: ['Title\n=====\n\nSub\n---\n\nText\n', '# Title\n\n## Sub\n\nText\n'],
  wrapped: ['A paragraph that was\nwrapped by hand\nover three lines.\n', 'A paragraph that was wrapped by hand over three lines.\n'],
  reference: ['See [the site][s].\n\n[s]: https://example.com\n', 'See [the site](https://example.com).\n'],
  'no final line break': ['Text', 'Text\n'],
};
await q(async (SAME, TIDY) => {
  FLE.load('<main><h1>Page</h1><h2>Sec</h2><p>text</p></main>'); window.PAGE = FLE.build();
  const spec = { 'Page.html': PAGE, 'work.md': '# Work\n\nFirst paragraph.\n\n## Part\n\n- a\n- b\n', 'html.md': '# H\n\n<div class="aside">A <em>div</em> block</div>\n\n<!-- a comment -->\n\nText.\n' };
  Object.entries(SAME).forEach(([k, v]) => { spec['same ' + k + '.md'] = v; }); Object.entries(TIDY).forEach(([k, v]) => { spec['tidy ' + k + '.md'] = v[0]; });
  window.R = MFS.make(spec, 'Notes'); await FLE.NB.openRoot(R, false, true); FLE.NB.toggle(true);
}, SAME, TIDY);
await sleep(300);

/* ----- round trips ----- */
const diff = [];
for (const k of Object.keys(SAME)) { await clickRow('same ' + k + '.md'); await touch(); await save(); const out = await text('same ' + k + '.md'); if (out !== SAME[k]) diff.push([k, out]); }
same('a file opened, touched and saved comes back exactly as it was (' + Object.keys(SAME).length + ' kinds of content)', diff, []);
const tidy = [];
for (const k of Object.keys(TIDY)) { await clickRow('tidy ' + k + '.md'); await touch(); await save(); const out = await text('tidy ' + k + '.md'); if (out !== TIDY[k][1]) tidy.push([k, out]); }
same('other ways of writing the same thing are saved in the one style', tidy, []);
check('no HTML page is ever made for a Markdown file', !(await paths()).some(p => /^(same|tidy) .*\.html$/.test(p)));
check('each save kept the version it replaced in history, as .md', (await paths()).filter(p => /^\.history\/tidy setext\.md\/.+\.md$/.test(p)).length === 1);

/* ----- the Markdown profile ----- */
await clickRow('work.md');
let s = await state();
same('a Markdown file opens in the page editor, tied to its file', [s.cur.kind, s.cur.node, await q(() => document.querySelector('#doc h1').textContent), await pg.$eval('#tx', e => e.hidden)], ['md', 'work.md', 'Work', true]);
same('a bar under the toolbar says it is Markdown and how it is saved', await q(() => [document.querySelector('#xbar').hidden, document.querySelector('#x-kind').textContent, document.querySelector('#x-name').textContent, /Saved as Markdown/.test(document.querySelector('#x-info').textContent), document.querySelector('[data-a="xwrap"]').hidden]), [false, 'Markdown', 'work.md', true, true]);
const off = await q(() => ({ acts: [...document.querySelectorAll('#tbar button:disabled')].map(x => x.dataset.a).sort(), box: document.querySelector('#s-boxtype').disabled, styles: [...document.querySelectorAll('#s-block option:disabled')].map(o => o.value), fmt: [...document.querySelectorAll('#s-fmt option:disabled')].map(o => o.value), title: document.querySelector('[data-a="diagram"]').title }));
same('commands for things Markdown cannot hold are switched off', [off.acts, off.box, off.styles, off.fmt], [['blocks', 'dense', 'diagram', 'hc', 'hr', 'index', 'ldense', 'margin', 'md', 'mr', 'note', 'qa', 'sc', 'split', 'sr', 'stage', 'tag', 'tfmt'], true, ['p.sub', 'p.h2sub', 'p.bluf', 'p.cap', 'dt', 'dd'], ['sup', 'sub', 'pill', 'pillr']]);
check('and their tooltips say why', /not available in a Markdown file/.test(off.title));
check('the rest still work: bold, lists, checklist, link, code block, table', await q(() => ['bold', 'italic', 'ul', 'ol', 'check', 'link', 'code', 'table', 'clear', 'emoji'].every(a => !document.querySelector('[data-a="' + a + '"]').disabled)));
check('H2 headings are not numbered for a Markdown file, and there is no index', await q(() => getComputedStyle(document.querySelector('#doc h2'), '::before').content === 'none' && getComputedStyle(document.querySelector('.page > nav')).display === 'none'));
const look = await q(() => { const d = document.querySelector('#doc'), g = (s, k) => getComputedStyle(d.querySelector(s))[k]; return { body: getComputedStyle(d).fontFamily, h1: g('h1', 'fontFamily'), h2: g('h2', 'fontFamily'), h2c: g('h2', 'color'), h2b: g('h2', 'borderTopStyle'), li: g('li', 'fontFamily') }; });
check('a Markdown file is shown plain, in the system fonts, with nothing of the Fine Line look', [look.body, look.h1, look.h2, look.li].every(f => /^system-ui/.test(f) && !/Architects|Instrument/.test(f)) && look.h2c === 'rgb(31, 35, 40)' && look.h2b === 'none', look);

/* ----- editing with the toolbar and saving ----- */
await q(() => { const p = document.querySelector('#doc p'), r = document.createRange(); r.setStart(p.firstChild, 0); r.setEnd(p.firstChild, 5); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.querySelector('#doc').focus(); }); await sleep(40);
await pg.click('#chrome button[data-a="bold"]'); await sleep(80);
await caret('#doc ul li:last-child'); await pg.keyboard.press('Enter'); await pg.keyboard.type('c with * star'); await sleep(60);
await caret('#doc ul li:last-child'); await pg.click('#chrome button[data-a="table"]'); await sleep(150);
await q(() => { const t = document.querySelector('#doc table'); t.rows[0].cells[0].textContent = 'K'; t.rows[0].cells[1].textContent = 'V'; t.rows[1].cells[0].textContent = 'a|b'; t.rows[1].cells[1].innerHTML = 'one<br>two'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(60);
check('typing and the toolbar mark the file as changed', await dirty());
await save();
const out = await text('work.md');
check('bold, a new list item and a new table are written as Markdown', out.startsWith('# Work\n\n**First** paragraph.\n\n## Part\n\n- a\n- b\n- c with * star\n') && /\| K \| V \|/.test(out) && /\| a\\\|b \| one<br>two \|/.test(out) && /\| --- \| --- \|/.test(out), out);
check('the save is reported, in place, with nothing left unsaved', !(await dirty()) && (await state()).cur.node === 'work.md' && await q(() => /File saved: work\.md/.test(document.querySelector('#savedmsg').textContent)));
await q(() => { const i = document.createElement('ul'); i.className = 'check'; i.innerHTML = '<li><input type="checkbox">buy milk</li><li><input type="checkbox">call Sam</li>'; document.querySelector('#doc').appendChild(i); i.querySelectorAll('input')[1].checked = true; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(60); await save();
check('a checklist is written as a task list, ticks included', /- \[ \] buy milk\n- \[x\] call Sam\n$/.test(await text('work.md')), await text('work.md'));

/* ----- what Markdown cannot keep is named before saving ----- */
await q(() => { const d = document.querySelector('#doc'); d.insertAdjacentHTML('beforeend', '<div class="box box-tip" role="note"><p class="box-h">Tip</p><p>Boxed words.</p></div><div class="dg" data-drawio="&lt;mxfile/&gt;" contenteditable="false"><svg viewBox="0 0 10 10"><text>DIAGRAMTEXT</text></svg></div><p>ID <span class="id">AB-1</span> here.</p>'); d.dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(60);
let d0 = dialogs.length; await save();
check('a box, a diagram and an ID tag pasted in are named before the save', dialogs.length === d0 + 1 && /Markdown cannot keep everything/.test(dialogs[d0]) && /1 diagram \(left out\)/.test(dialogs[d0]) && /1 box/.test(dialogs[d0]) && /1 ID tag/.test(dialogs[d0]), dialogs.slice(d0));
const lossy = await text('work.md');
check('their words are saved as plain content and the diagram is left out', /Tip\n\nBoxed words\./.test(lossy) && /ID AB-1 here\./.test(lossy) && !/DIAGRAMTEXT|svg|class=/.test(lossy), lossy);
d0 = dialogs.length; await touch(); await save();
check('the question is asked once for the file, not at every save', dialogs.length === d0);
await clickRow('html.md'); d0 = dialogs.length; await touch(); await save();
check('HTML written inside a Markdown file is named as not kept', dialogs.length === d0 + 1 && /HTML written inside the file/.test(dialogs[d0]) && /A \*div\* block/.test(await text('html.md')) && !/<div|<!--/.test(await text('html.md')), [dialogs.slice(d0), await text('html.md')]);

/* ----- the Source button: the same file as formatted text or as its source ----- */
await q(() => MFS.put(R, 'src.md', '---\ntitle: S\n---\n# Src\n\n<!-- kept while unchanged -->\nText *here*.\n'));
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300); await clickRow('src.md');
check('a Markdown file shows the Source button, not lit', await q(() => { const b = document.querySelector('[data-a="xsrc"]'); return !b.hidden && b.getAttribute('aria-pressed') === 'false'; }));
await pg.click('#chrome button[data-a="xsrc"]'); await sleep(300);
let sv = await state();
same('Source shows the file exactly as it is on disk while nothing has changed', [sv.cur.kind, sv.cur.node, await q(() => FLE.NB.TXT.content()), await q(() => document.querySelector('[data-a="xsrc"]').getAttribute('aria-pressed')), await q(() => document.querySelector('#x-kind').textContent), await dirty()], ['text', 'src.md', '---\ntitle: S\n---\n# Src\n\n<!-- kept while unchanged -->\nText *here*.\n', 'true', 'Markdown source', false]);
await pg.click('#tx .cm-content'); await q(() => { const v = FLE.NB.TXT.view; v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); }); await pg.keyboard.type('\n- added in source\n'); await sleep(100);
await pg.click('#chrome button[data-a="xsrc"]'); await sleep(300);
sv = await state();
check('back to formatted, the change made in the source is there and still unsaved', sv.cur.kind === 'md' && await dirty() && await q(() => [...document.querySelectorAll('#doc li')].some(l => l.textContent === 'added in source')) && await text('src.md') === '---\ntitle: S\n---\n# Src\n\n<!-- kept while unchanged -->\nText *here*.\n');
await q(() => { document.querySelector('#doc h1').textContent = 'Src changed'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(50);
d0 = dialogs.length; await pg.click('#chrome button[data-a="xsrc"]'); await sleep(300);
check('with changes, the source is written from the formatted view, naming what it cannot keep first', dialogs.length === d0 + 1 && /HTML written inside the file/.test(dialogs[d0]) && /^---\ntitle: S\n---\n# Src changed\n/.test(await q(() => FLE.NB.TXT.content())) && /- added in source/.test(await q(() => FLE.NB.TXT.content())), [dialogs.slice(d0), await q(() => FLE.NB.TXT.content())]);
await pg.keyboard.down('Control'); await pg.keyboard.press('s'); await pg.keyboard.up('Control'); await sleep(400);
check('Save from the source view writes the source', /^---\ntitle: S\n---\n# Src changed\n/.test(await text('src.md')) && !(await dirty()));
await menu('src.md', 'Open as text'); sv = await state();
check('Open as text on the open file keeps the source view', sv.cur.kind === 'text' && sv.cur.node === 'src.md');
await pg.click('#chrome button[data-a="xsrc"]'); await sleep(300);
check('the Source button goes back to formatted', (await state()).cur.kind === 'md' && await q(() => document.querySelector('#doc h1').textContent === 'Src changed'));
await clickRow('Page.html');
check('a page shows no Source button', await q(() => document.querySelector('[data-a="xsrc"]').hidden));

/* ----- leaving, pages again, encoding ----- */
await clickRow('work.md'); await q(() => { document.querySelector('#doc h1').textContent = 'Work changed'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(50);
await clickRow('Page.html');
check('leaving a changed Markdown file asks first, by its name', await q(() => document.querySelector('#nb-ask').open && /work\.md/.test(document.querySelector('#nb-ask-t').textContent)));
await pg.click('#nb-ask button[value="save"]'); await sleep(500);
s = await state();
check('Save and switch writes the .md, then opens the page', /^# Work changed\n/.test(await text('work.md')) && s.cur.kind === 'page' && s.cur.node === 'Page.html');
// (Hide icon in the Box list is off whenever the cursor is outside a box, on any page, so it is not counted)
same('on a page every command is back, the bar has gone and H2s are numbered again', await q(() => [document.querySelectorAll('#tbar button:disabled, #tbar select:disabled, #tbar option:disabled:not([value="icon"])').length, document.querySelector('#xbar').hidden, getComputedStyle(document.querySelector('#doc h2'), '::before').content !== 'none', /not available/.test(document.querySelector('[data-a="diagram"]').title)]), [0, true, true, false]);
await q(() => { MFS.putBytes(R, 'win.md', [0xEF, 0xBB, 0xBF, ...new TextEncoder().encode('# Caf\u00e9\r\n\r\n- one\r\n- two\r\n')]); MFS.putBytes(R, 'odd.md', [0x23, 0x20, 0xE9, 0x0A]); });
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
await clickRow('win.md'); await q(() => { document.querySelector('#doc li').textContent = 'uno'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(50); await save();
same('a Markdown file with a byte order mark and CRLF keeps both', await bytes('win.md'), [0xEF, 0xBB, 0xBF, ...Buffer.from('# Caf\u00e9\r\n\r\n- uno\r\n- two\r\n', 'utf8')]);
await clickRow('odd.md'); s = await state();
check('a Markdown file that is not UTF-8 is shown read-only by the text editor instead', s.cur.kind === 'text' && /not UTF-8/.test((await q(() => FLE.NB.TXT.info())).ro), s.cur);

/* ----- history and Save as ----- */
await menu('work.md', 'File history'); await sleep(200);
const n = await q(() => document.querySelectorAll('#nb-hist-list .nb-li').length);
check('File history lists the earlier versions of a Markdown file', n >= 3, n);
await q(() => { const bs = document.querySelectorAll('#nb-hist-list button'); bs[bs.length - 1].click(); }); await sleep(450);
s = await state();
same('Restore puts the oldest copy in the editor as unsaved Markdown', [s.cur.kind, s.cur.node, await q(() => document.querySelector('#doc h1').textContent), await q(() => document.querySelectorAll('#doc li').length), await dirty()], ['md', 'work.md', 'Work', 2, true]);
await save(); same('and Save writes that version back', await text('work.md'), '# Work\n\nFirst paragraph.\n\n## Part\n\n- a\n- b\n');
await q(() => { window.showSaveFilePicker = async (o) => { window.PICK = o; return R.getFileHandle('copy of work.md', { create: true }); }; });
await pg.click('#chrome button[data-a="saveas"]'); await sleep(450);
check('Save as writes a copy as Markdown and leaves the open file as it is', await text('copy of work.md') === '# Work\n\nFirst paragraph.\n\n## Part\n\n- a\n- b\n' && await q(() => PICK.suggestedName === 'work.md' && /A copy was saved: copy of work\.md/.test(document.querySelector('#savedmsg').textContent)) && (await state()).cur.node === 'work.md');
same('no page errors', errors, []);
await b.close();
