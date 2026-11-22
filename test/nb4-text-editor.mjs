// The text editor: plain text, data and code files open in CodeMirror, coloured by their extension, and are saved back
// as themselves, in the encoding and with the line endings they had. CodeMirror is started only when first needed.
// History, the unsaved-changes prompt, rename and trash work as they do for pages. Files that are not text are read-only.
import { open, sleep, check, same } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
const { b, pg, errors, dialogs } = await open();
await pg.evaluate(installMockFs);
const q = (f, ...a) => pg.evaluate(f, ...a);
const row = (p) => '.nb-row[title="' + p + '"]';
const state = () => q(() => FLE.NB.state);
const info = () => q(() => FLE.NB.TXT.info());
const paths = () => q(() => MFS.paths(R));
const text = (p) => q((p) => MFS.text(R, p), p);
const bytes = (p) => q((p) => MFS.bytes(R, p), p);
const msg = () => q(() => document.querySelector('#nb-msg').textContent);
const dirty = () => q(() => document.querySelector('[data-a="save"]').classList.contains('has'));
const clickRow = async (p) => { await pg.click(row(p)); await sleep(300); };
const save = async () => { await pg.click('#chrome button[data-a="save"]'); await sleep(400); };
const menu = async (p, item) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const ok = await q((item) => { const x = [...document.querySelectorAll('#nb-menu button')].find(k => k.textContent === item); if (x) x.click(); return !!x; }, item); await sleep(350); return ok; };
const menuItems = async (p) => { await pg.click(row(p), { button: 'right' }); await sleep(100); const v = await q(() => [...document.querySelectorAll('#nb-menu button')].map(x => x.textContent)); await pg.keyboard.press('Escape'); await sleep(50); return v; };
const typeAtEnd = async (t) => { await pg.click('#tx .cm-content'); await q(() => { const v = FLE.NB.TXT.view; v.dispatch({ selection: { anchor: v.state.doc.length } }); v.focus(); }); await pg.keyboard.type(t); await sleep(120); };
const colours = () => q(() => [...new Set([...document.querySelectorAll('#tx .cm-line span')].map(s => getComputedStyle(s).color))].length);
const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

await q(async () => {
  FLE.load('<main><h1>Page</h1><p>text</p></main>'); window.PAGE = FLE.build();
  window.R = MFS.make({
    'Page.html': PAGE, 'data.json': '{\r\n  "name": "x",\r\n  "n": 12,\r\n  "ok": true\r\n}\r\n', 'run.ps1': 'param([string]$Name)\n# say hello\nWrite-Host "Hello $Name"\n', 'go.bat': '@echo off\r\nrem a note\r\nset X=1\r\nif "%X%"=="1" goto done\r\n:done\r\necho %X% finished\r\n',
    'q.sql': 'SELECT a, b FROM t WHERE a = 1; -- c\n', 'cfg.yaml': 'key: value\nlist:\n  - 1\n', 'page.xml': '<a b="c"><!-- n --><d/></a>\n', 's.css': 'a { color: red; }\n', 'm.js': 'const a = 1; // c\n', 'm.ts': 'let a: number = 1;\n', 'm.py': 'def f(x):\n    return x  # c\n',
    'x.sh': '#!/bin/sh\necho "hi"\n', 'p.toml': '[a]\nb = 1\n', 'c.ini': '[s]\nk=v\n', 'notes.txt': 'plain words\nsecond line', 'draw.drawio': '<mxfile><diagram/></mxfile>', 'notes.md': '# Title\n\nSome *text*.\n', 'pic.png': 'png', 'thing.xyz': 'unknown'
  }, 'Code');
  await FLE.NB.openRoot(R, false, true); FLE.NB.toggle(true);
});
await sleep(300);

/* ----- which files open, and when CodeMirror starts ----- */
same('text, data and code files are offered as files that open; other kinds stay greyed', await q(() => ['data.json', 'run.ps1', 'go.bat', 'notes.txt', 'draw.drawio', 'pic.png', 'thing.xyz'].map(n => document.querySelector('.nb-row[title="' + n + '"]').classList.contains('k-page'))), [true, true, true, true, true, false, false]);
check('CodeMirror is carried in the program but not started yet', await q(() => typeof FLCM === 'undefined' && document.querySelector('#cm-src').textContent.length > 100000));
await clickRow('Page.html');
check('opening a page does not start it either', await q(() => typeof FLCM === 'undefined') && (await state()).cur.kind === 'page');
await clickRow('data.json');
let s = await state(), i = await info();
check('the first text file starts it, with no script refused', await q(() => typeof FLCM === 'object' && !!document.querySelector('#tx .cm-editor')) && errors.length === 0, errors);
same('a JSON file opens in the text editor as itself', [s.cur.kind, s.cur.node, i.type, i.enc, i.eol, i.ro], ['text', 'data.json', 'JSON', 'UTF-8', 'CRLF', '']);
check('the page area steps aside and the toolbar keeps only File and History', await q(() => getComputedStyle(document.querySelector('.page')).display === 'none' && !document.querySelector('#tx').hidden && [...document.querySelectorAll('#tbar .grp')].filter(g => g.offsetParent).map(g => g.getAttribute('aria-label')).join() === 'File,History'));
same('a bar under the toolbar names the kind, the file, its encoding, line endings and indentation', await q(() => [document.querySelector('#xbar').hidden, document.querySelector('#x-kind').textContent, document.querySelector('#x-name').textContent, document.querySelector('#x-info').textContent]), [false, 'JSON', 'data.json', 'UTF-8 | CRLF | 2 spaces']);
check('the text is coloured', await colours() >= 3, await colours());
same('the text shown is the file, line for line', await q(() => FLE.NB.TXT.content()), '{\n  "name": "x",\n  "n": 12,\n  "ok": true\n}\n');

/* ----- languages by extension ----- */
const langs = {};
for (const [f, want] of [['run.ps1', 'PowerShell'], ['go.bat', 'Batch'], ['q.sql', 'SQL'], ['cfg.yaml', 'YAML'], ['page.xml', 'XML'], ['draw.drawio', 'XML'], ['s.css', 'CSS'], ['m.js', 'JavaScript'], ['m.ts', 'TypeScript'], ['m.py', 'Python'], ['x.sh', 'Shell'], ['p.toml', 'TOML'], ['c.ini', 'Properties'], ['notes.txt', 'Plain text']]) {
  await clickRow(f); const k = await info(); langs[f] = [k.type === want, want === 'Plain text' ? await colours() <= 1 : await colours() >= 2];
}
same('each kind of file gets its own language, and plain text none', Object.entries(langs).filter(([, v]) => !(v[0] && v[1])), []);
await clickRow('go.bat');
check('batch files: comments, labels, variables and commands are told apart', await q(() => { const c = sel => [...document.querySelectorAll('#tx .cm-line')].map(l => [...l.querySelectorAll('span')].map(x => getComputedStyle(x).color + ':' + x.textContent)); const all = c().flat(); const col = t => (all.find(x => x.endsWith(':' + t)) || '').split(':')[0]; return !!col('rem a note') && !!col('%X%') && !!col(':done') && new Set([col('rem a note'), col('%X%'), col('set')]).size === 3; }));

/* ----- editing and saving: the file stays what it is ----- */
await clickRow('data.json'); check('nothing is unsaved after opening', !(await dirty()));
await typeAtEnd('// more');
check('typing marks the file as changed', await dirty());
await save();
same('Save writes the same file, with its CRLF line endings, and makes no page', [await text('data.json'), (await paths()).filter(p => /data/.test(p) && !p.startsWith('.history'))], ['{\r\n  "name": "x",\r\n  "n": 12,\r\n  "ok": true\r\n}\r\n// more', ['data.json']]);
check('and the save is reported and nothing is left unsaved', !(await dirty()) && await q(() => /File saved: data\.json/.test(document.querySelector('#savedmsg').textContent)));
await clickRow('notes.txt'); await typeAtEnd('!'); await pg.keyboard.down(mod); await pg.keyboard.press('s'); await pg.keyboard.up(mod); await sleep(400);
same('Ctrl+S saves from inside the text editor; a file with no final line break gets none added', await text('notes.txt'), 'plain words\nsecond line!');

/* ----- undo and redo belong to the text editor ----- */
await clickRow('q.sql'); await typeAtEnd('X'); await typeAtEnd('Y');
await pg.click('#chrome button[data-a="undo"]'); await sleep(100);
const afterUndo = await q(() => FLE.NB.TXT.content());
await pg.click('#chrome button[data-a="redo"]'); await sleep(100);
check('the toolbar Undo and Redo work on the text', !/XY\s*$/.test(afterUndo) && /XY\s*$/.test(await q(() => FLE.NB.TXT.content())), afterUndo);
await pg.click('#tx .cm-content'); await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(100);
check('and so does Ctrl+Z', !/XY\s*$/.test(await q(() => FLE.NB.TXT.content())));
await clickRow('cfg.yaml'); check('leaving a changed file asks first, by its name', await q(() => document.querySelector('#nb-ask').open && /q\.sql/.test(document.querySelector('#nb-ask-t').textContent)));
await pg.click('#nb-ask button[value="discard"]'); await sleep(300);
check('Discard switches and leaves the file as it was', (await state()).cur.node === 'cfg.yaml' && await text('q.sql') === 'SELECT a, b FROM t WHERE a = 1; -- c\n');
await pg.click('#tx .cm-content'); await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(100);
same('undo never reaches back into the file that was open before', await q(() => FLE.NB.TXT.content()), 'key: value\nlist:\n  - 1\n');

/* ----- wrap and find ----- */
await pg.click('#chrome button[data-a="xwrap"]'); await sleep(100);
check('Wrap lines turns wrapping on and shows it', await q(() => document.querySelector('[data-a="xwrap"]').getAttribute('aria-pressed') === 'true' && !!document.querySelector('#tx .cm-lineWrapping')));
await pg.click('#chrome button[data-a="xwrap"]'); await pg.click('#chrome button[data-a="xfind"]'); await sleep(150);
check('Find opens the find and replace panel', await q(() => !!document.querySelector('#tx .cm-search')));
await pg.keyboard.press('Escape');

/* ----- encodings ----- */
await q(() => {
  const enc = s => [...new TextEncoder().encode(s)];
  MFS.putBytes(R, 'bom.txt', [0xEF, 0xBB, 0xBF, ...enc('café\r\n')]);
  const u16 = s => { const a = [0xFF, 0xFE]; for (const ch of s) { const c = ch.charCodeAt(0); a.push(c & 255, c >> 8); } return a; };
  MFS.putBytes(R, 'wide.ps1', u16('Write-Host "é"\r\n'));
  MFS.putBytes(R, 'latin.bat', [0x65, 0x63, 0x68, 0x6F, 0x20, 0xE9, 0x0D, 0x0A]);   // "echo é" in Windows-1252: not valid UTF-8
  MFS.putBytes(R, 'blob.txt', [0x41, 0x00, 0x42]);
  MFS.put(R, 'mixed.txt', 'a\r\nb\r\nc\nd\r\n');
  MFS.put(R, 'big.json', '[' + '"0123456789abcdef",\n'.repeat(120000) + '1]');
});
await pg.click('#nb button[data-nb="refresh"]'); await sleep(300);
await clickRow('bom.txt'); i = await info(); await typeAtEnd('x'); await save();
same('a UTF-8 file with a byte order mark keeps it, and its CRLF', [i.enc, await bytes('bom.txt')], ['UTF-8 with BOM', [0xEF, 0xBB, 0xBF, 0x63, 0x61, 0x66, 0xC3, 0xA9, 0x0D, 0x0A, 0x78]]);
await clickRow('wide.ps1'); i = await info(); const shown = await q(() => FLE.NB.TXT.content()); await typeAtEnd('#'); await save();
same('a UTF-16 file is read as text and saved as UTF-16', [i.enc, shown, (await bytes('wide.ps1')).slice(0, 4), (await bytes('wide.ps1')).slice(-6)], ['UTF-16 LE', 'Write-Host "é"\n', [0xFF, 0xFE, 0x57, 0x00], [0x0D, 0x00, 0x0A, 0x00, 0x23, 0x00]]);
await clickRow('latin.bat'); i = await info();
check('a file that is not UTF-8 or UTF-16 is shown read-only, and says so', /not UTF-8/.test(i.ro) && await q(() => /Read-only/.test(document.querySelector('#x-info').textContent)) && /echo/.test(await q(() => FLE.NB.TXT.content())), i);
await typeAtEnd('zzz'); await save();
same('it cannot be typed in or saved, so its bytes are safe', [await bytes('latin.bat'), /read-only/.test(await msg())], [[0x65, 0x63, 0x68, 0x6F, 0x20, 0xE9, 0x0D, 0x0A], true]);
await clickRow('blob.txt'); check('a file with binary content is read-only too', /not a text file/.test((await info()).ro));
await clickRow('mixed.txt'); i = await info(); await typeAtEnd('e'); await save();
same('mixed line endings are saved as the kind the file mostly had, and the bar says so', [i.eol, await text('mixed.txt')], ['CRLF (was mixed)', 'a\r\nb\r\nc\r\nd\r\ne']);
await clickRow('big.json'); i = await info();
check('a very large file opens without colouring', i.plain === true && await colours() <= 1 && /too large to colour/.test(await q(() => document.querySelector('#x-info').textContent)), i);

/* ----- history, changes on disk, rename, trash ----- */
await clickRow('m.py'); await typeAtEnd('# one'); await save(); await typeAtEnd('\n# two'); await save();
const hist = (await paths()).filter(p => p.startsWith('.history/m.py/') && p !== '.history/m.py/');
check('each saved version that was replaced is kept in history, with the file\'s own extension', hist.length === 2 && hist.every(p => /\.py$/.test(p)), hist);
check('the menu offers File history for it', (await menuItems('m.py')).includes('File history') && (await menuItems('Page.html')).includes('Page history'));
await menu('m.py', 'File history'); await sleep(200);
check('the history lists the copies', await q(() => document.querySelector('#nb-hist').open && document.querySelectorAll('#nb-hist-list .nb-li').length === 2 && /History: m\.py/.test(document.querySelector('#nb-hist-h').textContent)));
await q(() => { const bs = document.querySelectorAll('#nb-hist-list button'); bs[bs.length - 1].click(); }); await sleep(400);
same('Restore puts the copy in the text editor as unsaved changes', [await q(() => FLE.NB.TXT.content()), await dirty(), await text('m.py')], ['def f(x):\n    return x  # c\n', true, 'def f(x):\n    return x  # c\n# one\n# two']);
await save(); same('and Save writes it', await text('m.py'), 'def f(x):\n    return x  # c\n');
await q(() => MFS.put(R, 'm.py', 'changed outside\n')); const d0 = dialogs.length; await typeAtEnd('# mine'); await save();
check('a file changed on disk since it was opened asks before it is replaced', dialogs.length === d0 + 1 && /changed on disk/.test(dialogs[dialogs.length - 1]) && /# mine$/.test(await text('m.py')), dialogs.slice(d0));
await menu('m.py', 'Rename'); await q(() => { document.querySelector('#nb-tree input').value = 'main.py'; }); await pg.focus('#nb-tree input'); await pg.keyboard.press('Enter'); await sleep(400);
s = await state();
check('renaming the open file keeps it open under its new name', s.cur.node === 'main.py' && await q(() => document.querySelector('#x-name').textContent) === 'main.py' && (await paths()).includes('.history/main.py/'), s.cur);
await typeAtEnd('!'); await save(); check('and the next save goes to the new name', /!$/.test(await text('main.py')) && !(await paths()).includes('m.py'));
await menu('main.py', 'Move to trash');
s = await state();
check('moving the open file to the trash goes back to a new page', s.cur.kind === 'page' && s.cur.node === null && await pg.$eval('#tx', e => e.hidden) && (await paths()).includes('.trash/main.py') && await q(() => document.querySelector('#xbar').hidden));

/* ----- Markdown as text, and leaving the text editor ----- */
check('a Markdown file offers Open as text', (await menuItems('notes.md')).includes('Open as text') && !(await menuItems('data.json')).includes('Open as text'));
await menu('notes.md', 'Open as text'); i = await info();
same('it shows the Markdown source in the text editor', [(await state()).cur.kind, i.type, await q(() => FLE.NB.TXT.content())], ['text', 'Markdown source', '# Title\n\nSome *text*.\n']);
await typeAtEnd('More.\n'); await save();
same('and saves the source exactly as typed', await text('notes.md'), '# Title\n\nSome *text*.\nMore.\n');
await pg.click('#chrome button[data-a="new"]'); await sleep(300);
check('New goes back to the page editor with its whole toolbar', (await state()).cur.kind === 'page' && await pg.$eval('#tx', e => e.hidden) && await q(() => [...document.querySelectorAll('#tbar .grp')].filter(g => g.offsetParent).length >= 7 && document.querySelector('#doc h1').textContent === 'Untitled document'));
await q(() => { document.querySelector('#doc h1').textContent = 'Typed'; document.querySelector('#doc').dispatchEvent(new Event('input', { bubbles: true })); }); await sleep(50);
await pg.keyboard.down(mod); await pg.keyboard.press('z'); await pg.keyboard.up(mod); await sleep(150);
check('and the page editor has its own undo back', await q(() => document.querySelector('#doc h1').textContent === 'Untitled document'));
same('no page errors', errors, []);
await b.close();
