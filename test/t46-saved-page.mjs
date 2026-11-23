// The saved page, checked by others' rules: axe-core finds no WCAG 2.2 AA or best-practice problem in the example; the
// page carries a security policy that lets nothing load and runs no script; hostile content
// opened and saved keeps nothing that runs or reaches the web; what the save adds for screen readers (box names, table
// regions, a plain corner cell) comes off when the page is opened, so editing, table changes and the next save are as
// before; the title falls back from the H1 to the file name to Untitled and a number; the page keeps its language.
// With Java installed, the W3C Nu validator also checks the saved example.
import { open, check, same, load, sleep, caretCell, click, ROOT } from './harness.mjs';
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';
const { b, pg, errors } = await open({ prompt: '2,2' });
const q = (f, ...a) => pg.evaluate(f, ...a);
const OUT = path.join(ROOT, 'test', 'out'); fs.mkdirSync(OUT, { recursive: true });
const view = async (html, bypass) => { const p = await b.newPage(); if (bypass) await p.setBypassCSP(true); const v = []; await p.exposeFunction('__v', s => v.push(s)); await p.evaluateOnNewDocument(() => document.addEventListener('securitypolicyviolation', e => window.__v(e.violatedDirective + ' ' + (e.blockedURI || ''))));
  const f = path.join(OUT, 'saved-view-' + Math.random().toString(36).slice(2) + '.html'); fs.writeFileSync(f, html); await p.goto('file://' + f); await sleep(400); return { p, v }; };

// the example, saved
const ex = fs.readFileSync(path.join(ROOT, 'candy-shop-sop.html'), 'utf8');
await load(pg, ex, 'candy-shop-sop.html'); const saved = await q(() => FLE.build());
{ const { p } = await view(saved, true); await p.addScriptTag({ content: fs.readFileSync(path.join(ROOT, 'node_modules', 'axe-core', 'axe.min.js'), 'utf8') });
  const v = await p.evaluate(async () => (await axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] })).violations.map(x => x.id + ': ' + x.nodes.length + ' ' + x.nodes[0].html.slice(0, 80)));
  same('axe-core finds no accessibility problem in the saved example (WCAG 2.2 AA and best practice)', v, []);
  same('checklist boxes are named by their items', await p.evaluate(() => [...document.querySelectorAll('ul.check input')].every(i => i.getAttribute('aria-label') && i.parentNode.textContent.trim().startsWith(i.getAttribute('aria-label').slice(0, 10)))), true);
  check('each table can be reached from the keyboard and is named after its heading', await p.evaluate(() => [...document.querySelectorAll('div.tw')].every(w => w.getAttribute('role') === 'region' && w.tabIndex === 0 && /^Table: \S/.test(w.getAttribute('aria-label')))));
  check('note buttons have a name', await p.evaluate(() => [...document.querySelectorAll('.note-log > summary')].every(s => s.getAttribute('aria-label') === 'Note')));
  await p.close(); }
check('the saved page says which version wrote it', /<meta name="generator" content="fine-line-editor \d+\.\d+\.\d+">/.test(saved));
check('and has a security policy: nothing loads, no script runs, no form sends, before the style sheet', /<meta charset="utf-8">\n<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; base-uri 'none'; form-action 'none'">/.test(saved));
await load(pg, saved, 'candy-shop-sop.html'); same('saving, opening and saving again gives the same file', await q(() => FLE.build()), saved);
check('the names and regions are not in the editor after opening', await q(() => !document.querySelector('#doc input[aria-label], #doc div.tw[role], #doc div.tw[tabindex]')));

// an older page diagram: no script; it keeps its drawn size and scrolls sideways in a narrow window
await load(pg, '<main><h1>Fig</h1><div class="fig"><div class="wb-board" style="width:2000px;height:400px"><div class="wb-box" style="left:10px;top:10px;width:100px;height:50px"><span>A</span></div></div></div></main>', 'f.html');
{ const h = await q(() => FLE.build()); check('a page with an older diagram carries no script and no script permission', !/<script/.test(h) && !/script-src/.test(h));
  const { p, v } = await view(h); same('it shows at its drawn size and scrolls sideways, with nothing blocked', [v, await p.evaluate(() => { const f = document.querySelector('.fig'), b = f.firstElementChild; return [b.style.transform || '', f.scrollWidth > f.clientWidth, getComputedStyle(f).overflowX]; })], [[], ['', true, 'auto']]); await p.close(); }
check('in the editor it is shown the same way, unscaled', await q(() => { const f = document.querySelector('#doc .fig'); return !f.firstElementChild.style.transform && f.scrollWidth > f.clientWidth; }));

// hostile content
await load(pg, `<!doctype html><html><head><meta http-equiv="refresh" content="0;url=https://evil.example"><base href="https://evil.example/"><script>alert(1)</script></head><body>
<h1 onclick="alert(2)">T</h1><p>a <img src=x onerror="alert(3)"> <a href="javascript:alert(4)">j</a> <a href=" JaVaScRiPt:alert(5)">j2</a> <a href="data:text/html,x">d</a></p>
<iframe src="https://evil.example"></iframe><object data="x.swf"></object><embed src="x"><form action="https://evil.example"><input name=p type=password></form>
<svg width="10" height="10"><script>alert(7)</script><a href="javascript:alert(8)"><rect width="5" height="5" onmouseover="alert(9)"/></a><use href="https://evil.example/x.svg#a"/></svg>
<p id="st" style="background:url(javascript:alert(11)); color: red">s</p><p id="st2" style="color: blue; background-image: url('https://evil.example/t.png')">t</p><math><mtext><table><mglyph><style><img src=x onerror=alert(12)>
<p><img src="https://tracker.example/pixel.gif"> <link rel=stylesheet href="https://evil.example/s.css"></p><template><img src=x onerror=alert(13)></template></body></html>`, 'x.html');
{ const h = await q(() => FLE.build()), body = h.slice(h.indexOf('<body'));
  same('opened and saved, nothing in it runs or reaches the web', ['<script', 'onerror', 'onclick', 'onmouseover', 'javascript:', 'data:text/html', '<iframe', '<object', '<embed', '<form', 'http-equiv', '<base', 'evil.example', 'tracker.example', '<use', '<math', '<template', '<link'].filter(k => body.toLowerCase().includes(k.toLowerCase())), []);
  same('a style loses only what would load, and what the browser cannot read', await q(() => [document.querySelector('#doc p:nth-of-type(2)') && [...document.querySelectorAll('#doc p')].map(p => p.getAttribute('style')).filter(Boolean)]), [['color: red;', 'color: blue;']]); }

// the empty corner of a table with a header row and a header column
const TB = '<main><h1>T</h1><div class="tw"><table><thead><tr><th scope="col"><br></th><th scope="col">A</th><th scope="col">B</th></tr></thead><tbody><tr><th scope="row">r1</th><td>a1</td><td>b1</td></tr><tr><th scope="row">r2</th><td>a2</td><td>b2</td></tr></tbody></table></div><p>after</p></main>';
const kinds = () => q(() => [...document.querySelector('#doc table').rows].map(r => [...r.cells].map(c => (c.tagName === 'TH' ? (c.classList.contains('sub') ? 'S' : 'H') + (c.getAttribute('scope') || '?')[0] : '.') + (c.textContent.trim() ? '' : '_')).join(' ')).join(' | '));
await load(pg, TB, 't.html'); const fresh = await kinds(); const tsaved = await q(() => FLE.build());
check('in the saved page the empty corner is a plain cell', /<thead><tr><td><br><\/td><th scope="col">A<\/th>/.test(tsaved), tsaved.slice(tsaved.indexOf('<table'), tsaved.indexOf('<table') + 120));
await load(pg, tsaved, 't.html'); same('opened again it is the header cell the editor made', await kinds(), fresh);
const ops = async () => { const out = []; for (const [r, c, a] of [[0, 1, 'cl'], [1, 0, 'r+'], [0, 0, 'ra'], [1, 1, 'c+'], [2, 1, 'r-'], [0, 2, 'c-'], [1, 1, 'hr'], [1, 1, 'hr'], [2, 2, 'hc'], [2, 2, 'hc'], [0, 0, 'split']]) { await caretCell(pg, 0, r, c); await sleep(30); await q((a) => { const x = document.querySelector('#chrome [data-a="' + a + '"]'); if (x) x.click(); }, a); await sleep(60); out.push(a + ' ' + await kinds()); } return out; };
await load(pg, TB, 't.html'); const opsFresh = await ops();
await load(pg, tsaved, 't.html'); const opsSaved = await ops();
same('rows and columns added and removed, header rows and columns set and cleared: the same on a reopened table as on one never saved', opsSaved, opsFresh);
await load(pg, '<main><h1>T</h1><div class="tw"><table><thead><tr><th scope="col"><br></th><th scope="col">A</th></tr></thead><tbody><tr><td>x</td><td>y</td></tr></tbody></table></div></main>', 'u.html');
check('a table with only a header row keeps its corner as a header cell', /<thead><tr><th scope="col"><br><\/th>/.test(await q(() => FLE.build())));
await load(pg, TB, 't.html'); await caretCell(pg, 0, 0, 0); await pg.keyboard.type('Key'); await sleep(80);
check('a corner with text in it stays a header cell', /<thead><tr><th scope="col">Key<\/th>/.test(await q(() => FLE.build())));

// the title
const title = () => q(() => FLE.build().match(/<title>([^<]*)<\/title>/)[1]);
await load(pg, '<main><h1>  The   plan </h1><p>x</p></main>', 'p.html'); same('the title is the H1', await title(), 'The plan');
await load(pg, '<main><h1><br></h1><p>x</p></main>', 'Kitchen notes.html'); same('with an empty H1 it is the file name', await title(), 'Kitchen notes');
await q(() => { document.querySelector('#doc').innerHTML = '<h1>\u200b </h1><p>x</p>'; }); same('also when the H1 holds only spaces', await title(), 'Kitchen notes');
await q(() => FLE.load('<main><p>x</p></main>', 'document.html')); check('a document with no name and no H1 is Untitled and a number', /^Untitled \d+$/.test(await title()), await title());

// the language
await load(pg, '<html lang="fr-CA"><body><main><h1>Bonjour</h1></main></body></html>', 'fr.html');
same('an opened page keeps its language, in the editor and when saved', [await q(() => document.querySelector('#doc').getAttribute('lang')), /<html lang="fr-CA">/.test(await q(() => FLE.build()))], ['fr-CA', true]);
await load(pg, '<html lang="x y"><body><main><h1>T</h1></main></body></html>', 'bad.html');
same('a language that is not a language tag is replaced by the browser\'s', await q(() => document.querySelector('#doc').getAttribute('lang')), await q(() => navigator.language));

// the W3C Nu validator, when Java is there
let java = true; try { execFileSync('java', ['-version'], { stdio: 'ignore' }); } catch (e) { java = false; }
const jar = path.join(ROOT, 'node_modules', 'vnu-jar', 'build', 'dist', 'vnu.jar');
if (java && fs.existsSync(jar)) { const f = path.join(OUT, 'saved-example.html'); fs.writeFileSync(f, saved); let out = ''; try { out = execFileSync('java', ['-jar', jar, '--errors-only', '--format', 'text', f], { stdio: ['ignore', 'pipe', 'pipe'] }).toString(); } catch (e) { out = (e.stdout || '').toString() + (e.stderr || '').toString(); }
  same('the W3C Nu validator finds no error in the saved example', out.split('\n').filter(l => /^Error/.test(l)), []); }
else console.log('note the W3C Nu validator check was skipped: it needs Java');
same('no errors in the page', errors, []);
await b.close();
