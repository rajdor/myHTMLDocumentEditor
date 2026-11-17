// Links keep working and are never fetched; images, video and audio from the web become link cards, so nothing in a
// document is downloaded when it opens, in the editor or in the saved file. Link button adds, edits and removes links.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors } = await open();
const fetched = []; pg.on('request', r => { if (!/^(data|blob|about|file|chrome)/.test(r.url())) fetched.push(r.url()); });

await load(pg, '<main><h1>T</h1><p>See <a href="https://example.com/doc">the doc</a> and <a href="#t">top</a>.</p>' +
  '<p><img src="https://example.com/pic.png" alt="Context diagram"></p><picture><source srcset="https://example.com/a.webp"><img src="https://example.com/a.png"></picture>' +
  '<video src="https://example.com/v.mp4" poster="https://example.com/p.jpg"></video><audio><source src="https://example.com/s.mp3"></audio>' +
  '<p style="background:url(https://example.com/bg.png)">bg</p><svg><image href="https://example.com/i.png"/></svg>' +
  '<p><img src="data:image/gif;base64,R0lGODlhAQABAAAAACw=" alt="embedded"></p></main>');
await sleep(800);
same('nothing is downloaded on open', fetched, []);
const cards = await pg.evaluate(() => [...document.querySelectorAll('#doc a.link-card')].map(a => a.dataset.kind + '|' + a.getAttribute('href') + '|' + a.textContent));
same('web media become link cards', cards, ['image|https://example.com/pic.png|Context diagramexample.com › pic.png', 'image|https://example.com/a.png|Imageexample.com › a.png', 'video|https://example.com/v.mp4|Videoexample.com › v.mp4', 'audio|https://example.com/s.mp3|Audioexample.com › s.mp3']);
check('embedded image stays an image', await pg.evaluate(() => !!document.querySelector('#doc img[alt="embedded"]')));
check('web addresses in styles and SVG images are dropped', await pg.evaluate(() => !/example\.com\/(bg|i)\.png/.test(document.getElementById('doc').innerHTML)));
check('status says what was turned into cards', /6 web items shown as link cards/.test(await pg.$eval('#status', s => s.textContent)), await pg.$eval('#status', s => s.textContent));

const out = await pg.evaluate(() => FLE.build());
check('saved web links open in a new tab without a referrer', out.includes('<a href="https://example.com/doc" target="_blank" rel="noopener noreferrer">the doc</a>'));
check('saved internal links are unchanged', out.includes('<a href="#t">top</a>'));
check('saved file keeps the cards and loads nothing from the web', /class="link-card"/.test(out) && !/<(img|video|audio|source)[^>]+(src|srcset)="https?:/i.test(out) && !/url\(https?:/i.test(out));

// a plain click in the editor places the cursor and does not navigate; hovering shows the address
const before = pg.url();
await pg.click('#doc a[href^="https"]:not(.link-card)'); await sleep(200);
same('plain click does not navigate', pg.url(), before);
await pg.hover('#doc a[href="#t"]'); check('hover shows the address', /#t/.test(await pg.$eval('#doc a[href="#t"]', a => a.title)));
check('hover text is not saved', !/Ctrl or Cmd/.test(await pg.evaluate(() => FLE.build())));

// Link button: a form with the display text and the address
const form = () => pg.evaluate(() => { const d = document.getElementById('linkdlg'); return { open: d.open, title: document.getElementById('link-h').textContent, text: document.getElementById('link-text').value, url: document.getElementById('link-url').value, err: document.getElementById('link-err').textContent, remove: !d.querySelector('[data-a="linkremove"]').hidden, textOff: document.getElementById('link-text').disabled }; });
const fill = (id, v) => pg.evaluate((id, v) => { document.getElementById(id).value = v; }, id, v);
const press = (a) => pg.evaluate((a) => document.querySelector('#linkdlg [data-a="' + a + '"]').click(), a);
const selectText = (sel, from, to) => pg.evaluate((sel, from, to) => { const n = document.querySelector(sel).firstChild, r = document.createRange(); r.setStart(n, from); r.setEnd(n, to); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); }, sel, from, to);
const html = (sel) => pg.evaluate((sel) => document.querySelector(sel).innerHTML, sel);
await caretIn(pg, '#doc a[href="#t"]'); await click(pg, 'link'); await sleep(100);
same('Link on an existing link opens the form with its text and address', await form(), { open: true, title: 'Edit link', text: 'top', url: '#t', err: '', remove: true, textOff: false });
check('the address box has the focus, ready to type or paste', await pg.evaluate(() => document.activeElement.id === 'link-url'));
await fill('link-url', 'https://example.org/page'); await fill('link-text', 'the top'); await press('linksave'); await sleep(100);
same('saving changes both the display text and the address', await pg.evaluate(() => [...document.querySelectorAll('#doc p a:not(.link-card)')].map(a => a.getAttribute('href') + '|' + a.textContent)), ['https://example.com/doc|the doc', 'https://example.org/page|the top']);
check('the form closes and the cursor is back in the document', !(await form()).open && await pg.evaluate(() => document.activeElement.id === 'doc'));

await load(pg, '<main><h1>T</h1><p id="p">Read the <b>fine</b> manual at https://example.com/m today</p><p id="q">second</p></main>');
// selected text becomes the display text
await selectText('#p', 0, 4); await click(pg, 'link'); await sleep(100);
same('with text selected, it is the display text and the address is ready to type', await form(), { open: true, title: 'Add link', text: 'Read', url: 'https://', err: '', remove: false, textOff: false });
await press('linksave'); await sleep(60);
same('an address is needed', (await form()).err, 'Enter an address.');
await fill('link-url', 'javascript:alert(1)'); await press('linksave'); await sleep(60);
check('unsafe link addresses are refused, in the form', (await form()).open && /Links can be/.test((await form()).err) && !(await pg.evaluate(() => !!document.querySelector('#p a'))));
await fill('link-url', 'https://example.com/read'); await pg.focus('#link-url'); await pg.keyboard.press('Enter'); await sleep(100);
same('Enter saves: the selected text becomes the link', (await html('#p')).slice(0, 52), '<a href="https://example.com/read">Read</a> the <b>f');
// changing the display text replaces the selected text
await pg.evaluate(() => { const n = document.querySelector('#p').lastChild, r = document.createRange(), i = n.data.indexOf('today'); r.setStart(n, i); r.setEnd(n, i + 5); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'link'); await sleep(100); await fill('link-text', 'now'); await fill('link-url', 'https://example.com/now'); await press('linksave'); await sleep(100);
check('a changed display text replaces the selected text', (await html('#p')).endsWith('<a href="https://example.com/now">now</a>'), await html('#p'));
// selected text that is a web address becomes the address
await pg.evaluate(() => { const n = [...document.querySelector('#p').childNodes].find(x => x.nodeType === 3 && x.data.includes('https://')), r = document.createRange(), i = n.data.indexOf('https://'); r.setStart(n, i); r.setEnd(n, i + 'https://example.com/m'.length); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'link'); await sleep(100);
same('selected text that is a web address is both the display text and the address', [(await form()).text, (await form()).url], ['https://example.com/m', 'https://example.com/m']);
await press('linksave'); await sleep(100);
check('and saving links it', (await html('#p')).includes('<a href="https://example.com/m">https://example.com/m</a>'));
// no selection: text and address typed; empty text shows the address
await caretIn(pg, '#q'); await click(pg, 'link'); await sleep(100);
same('with no selection the display text is empty', [(await form()).text, (await form()).url], ['', 'https://']);
await fill('link-url', 'https://example.com/x'); await fill('link-text', 'Example'); await press('linksave'); await sleep(100);
same('the link is inserted with its display text', await html('#q'), 'second<a href="https://example.com/x">Example</a>');
await caretIn(pg, '#q', false); await click(pg, 'link'); await sleep(100); await fill('link-url', 'https://example.com/y'); await press('linksave'); await sleep(100);
check('with no display text the address is shown', (await html('#q')).startsWith('<a href="https://example.com/y">https://example.com/y</a>'));
// cancel and Escape change nothing
const keepQ = await html('#q');
await caretIn(pg, '#q'); await click(pg, 'link'); await sleep(100); await fill('link-url', 'https://example.com/z'); await press('linkcancel'); await sleep(80);
await click(pg, 'link'); await sleep(100); await fill('link-url', 'https://example.com/z'); await pg.keyboard.press('Escape'); await sleep(80);
check('Cancel and Escape change nothing', !(await form()).open && await html('#q') === keepQ);
// formatting inside the selected text is kept when the text is not changed
await pg.evaluate(() => { const p = document.querySelector('#p'), b = p.querySelector('b'), r = document.createRange(); r.setStart(b.previousSibling, 1); r.setEnd(b.nextSibling, 7); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'link'); await sleep(100); await fill('link-url', 'https://example.com/fm'); await press('linksave'); await sleep(100);
check('formatting inside the selected text is kept', /<a href="https:\/\/example\.com\/fm">the <\/a><b><a href="https:\/\/example\.com\/fm">fine<\/a><\/b>|<a href="https:\/\/example\.com\/fm">the <b>fine<\/b> manual<\/a>/.test(await html('#p')), await html('#p'));
// several paragraphs selected: the text is kept as it is
await load(pg, '<main><h1>T</h1><p id="p">one</p><p id="q">two</p></main>');
await pg.evaluate(() => { const r = document.createRange(); r.setStart(document.querySelector('#p').firstChild, 0); r.setEnd(document.querySelector('#q').firstChild, 3); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'link'); await sleep(100);
check('with several paragraphs selected the display text cannot be edited', (await form()).textOff);
await fill('link-url', 'https://example.com/both'); await press('linksave'); await sleep(100);
same('and both are linked as they are', [await html('#p'), await html('#q')], ['<a href="https://example.com/both">one</a>', '<a href="https://example.com/both">two</a>']);
// remove
await caretIn(pg, '#p a'); await click(pg, 'link'); await sleep(100); await press('linkremove'); await sleep(100);
same('Remove link removes it and keeps the text', await html('#p'), 'one');
await caretIn(pg, '#q a'); await click(pg, 'link'); await sleep(100); await fill('link-url', ''); await press('linksave'); await sleep(100);
same('so does clearing the address', await html('#q'), 'two');
// the clipboard is the default address only when the browser already allows reading it
const clip = (state, text) => pg.evaluate((state, text) => { window.__reads = 0; Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query: async () => ({ state }) } }); Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { readText: async () => { window.__reads++; return text; } } }); }, state, text);
await clip('granted', ' https://example.com/from-clipboard ');
await caretIn(pg, '#p'); await click(pg, 'link'); await sleep(150);
same('a web address on the clipboard is the default address, when reading is already allowed', (await form()).url, 'https://example.com/from-clipboard');
await press('linkcancel'); await sleep(60);
await clip('granted', 'just some words');
await click(pg, 'link'); await sleep(150); same('other clipboard text is not used', (await form()).url, 'https://'); await press('linkcancel'); await sleep(60);
await clip('prompt', 'https://example.com/from-clipboard');
await click(pg, 'link'); await sleep(150);
same('when the browser would have to ask, the clipboard is not read at all', [(await form()).url, await pg.evaluate(() => window.__reads)], ['https://', 0]); await press('linkcancel'); await sleep(60);
await clip('granted', 'https://example.com/from-clipboard');
await pg.evaluate(() => { const n = document.querySelector('#p').firstChild; n.data = 'https://example.com/sel'; const r = document.createRange(); r.selectNodeContents(n); const g = getSelection(); g.removeAllRanges(); g.addRange(r); document.getElementById('doc').focus(); });
await click(pg, 'link'); await sleep(150);
same('a selected web address comes before the clipboard', [(await form()).url, await pg.evaluate(() => window.__reads)], ['https://example.com/sel', 0]); await press('linkcancel'); await sleep(60);
await b.close();
same('no page errors', errors, []);
