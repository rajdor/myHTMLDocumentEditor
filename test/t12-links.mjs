// Links keep working and are never fetched; images, video and audio from the web become link cards, so nothing in a
// document is downloaded when it opens, in the editor or in the saved file. Link button adds, edits and removes links.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors } = await open({ prompt: 'https://example.org/page' });
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

// Link button: edit, refuse unsafe, remove
await caretIn(pg, '#doc a[href="#t"]'); await click(pg, 'link'); await sleep(100);
same('Link on an existing link edits it', await pg.evaluate(() => [...document.querySelectorAll('#doc p a:not(.link-card)')].map(a => a.getAttribute('href'))), ['https://example.com/doc', 'https://example.org/page']);
await b.close();

const t2 = await open({ prompt: 'javascript:alert(1)' });
await load(t2.pg, '<main><p>word</p></main>');
await t2.pg.evaluate(() => { const p = document.querySelector('#doc p'), r = document.createRange(); r.selectNodeContents(p); const s = getSelection(); s.removeAllRanges(); s.addRange(r); });
await click(t2.pg, 'link'); await sleep(100);
check('unsafe link addresses are refused', !(await t2.pg.evaluate(() => !!document.querySelector('#doc a'))) && t2.dialogs.some(d => /Links can be/.test(d)), t2.dialogs);
await t2.b.close();

const t3 = await open({ prompt: '' });
await load(t3.pg, '<main><p>a <a href="https://x.org">x</a> b</p></main>');
await caretIn(t3.pg, '#doc a'); await click(t3.pg, 'link'); await sleep(100);
same('clearing the address removes the link', await t3.pg.evaluate(() => document.querySelector('#doc p').innerHTML), 'a x b');
await t3.b.close();
same('no page errors', errors, []);
