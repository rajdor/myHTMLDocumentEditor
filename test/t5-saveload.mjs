// Save and re-open: the saved file is self-contained, carries no editor state, numbers its index, and re-opens unchanged.
import { open, check, same, load, sleep, click, caretCell } from './harness.mjs';
const { b, pg } = await open();
await load(pg, '<main><h1>Doc</h1><h2>One</h2><p>Text</p><div class="tw"><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></main>');
await caretCell(pg, 0, 0, 0); await click(pg, 'mr');
const html = await pg.evaluate(() => FLE.build());
check('one self-contained file', html.startsWith('<!DOCTYPE html>') && !/<link[^>]+stylesheet/.test(html) && !/src="http/.test(html));
check('no editor state saved', !/contenteditable|ed-sel|ed-active|ed-handle|ed-dsel/.test(html));
check('no script in the saved page', !/<script/.test(html) && !/script-src/.test(html));
check('index built', /<nav aria-label="Index" data-depth="1"><b>Index<\/b><ol><li><a href="#one">One<\/a>/.test(html));
check('font embedded', /@font-face[^}]*Architects Daughter[^}]*base64/.test(html));
check('merged cell saved', /<td colspan="2">a<br>b<\/td>/.test(html), html.match(/<td[^>]*>a[^<]*/));
await load(pg, html, 'again.html');
same('re-opened content identical', await pg.evaluate(() => FLE.build()), html);
// the Open and Save dialogs ask the browser to remember the last folder
const opts = await pg.evaluate(async () => { const seen = []; window.showOpenFilePicker = async o => { seen.push(o); throw Object.assign(new Error('x'), { name: 'AbortError' }); }; window.showSaveFilePicker = async o => { seen.push(o); throw Object.assign(new Error('x'), { name: 'AbortError' }); };
  document.querySelector('[data-a="saveas"]').click(); await new Promise(r => setTimeout(r, 100)); FLE.load('<main><p>x</p></main>'); document.querySelector('[data-a="open"]').click(); await new Promise(r => setTimeout(r, 100)); return seen.map(o => o.id); });
same('Open and Save dialogs remember the last folder', opts, ['fine-line-documents', 'fine-line-documents']);
await b.close();
