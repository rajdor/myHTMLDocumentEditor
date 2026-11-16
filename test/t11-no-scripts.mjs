// No script from a document ever runs in the editor. Two independent layers: opening cleans the document, and the
// editor's Content Security Policy only lets the editor's own scripts (and the diagram editor's) run, so anything that
// slips past the cleaning is still blocked. Dropped HTML arrives as plain text. The editor and diagram editor still work.
import { open, check, same, load, sleep, waitFor } from './harness.mjs';
const { b, pg, errors } = await open();
await pg.evaluate(() => { window.__v = []; document.addEventListener('securitypolicyviolation', e => window.__v.push(e.violatedDirective + ' ' + (e.blockedURI || ''))); });

const csp = await pg.$eval('meta[http-equiv="Content-Security-Policy"]', m => m.content).catch(() => '');
check('editor has a Content Security Policy', /script-src 'sha256-/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp) && /object-src 'none'/.test(csp), csp);
same('no own script is blocked', await pg.evaluate(() => window.__v), []);

// Layer 2 on its own: put dangerous markup straight into the page, bypassing the cleaning on open.
await pg.evaluate(() => {
  window.__x = 0;
  document.getElementById('doc').insertAdjacentHTML('beforeend',
    '<img src="data:," onerror="window.__x=1"><img src="x" onload="window.__x=2"><svg><animate onbegin="window.__x=3" attributeName="x" dur="1s"/></svg>' +
    '<details open ontoggle="window.__x=4"><summary>s</summary></details><a id="js" href="javascript:window.__x=5">j</a>' +
    '<iframe srcdoc="<script>parent.__x=6<\/script>"></iframe>');
  const s = document.createElement('script'); s.textContent = 'window.__x=7'; document.getElementById('doc').appendChild(s);
});
await sleep(1200);
await pg.evaluate(() => document.getElementById('js').click()); await sleep(300);
same('injected handlers, links, frames and scripts do not run', await pg.evaluate(() => window.__x), 0);
check('the browser reports them as blocked', (await pg.evaluate(() => window.__v.length)) > 0, await pg.evaluate(() => window.__v));

// Layer 1: opening a document removes them first.
await load(pg, '<main><h1>T</h1><img src="x" onerror="window.__x=1"><script>window.__x=2</script><a href=" java&#9;script:window.__x=3">j</a><svg><a xlink:href="javascript:window.__x=4"><text>t</text></a><set attributeName="href" to="javascript:window.__x=5"/></svg><object data="x"></object><embed src="x"><form action="x"><input></form><base href="https://example.com/"></main>');
await sleep(800);
same('opened document is cleaned', await pg.evaluate(() => [...document.querySelectorAll('#doc *')].filter(e => /^(SCRIPT|IFRAME|OBJECT|EMBED|FORM|INPUT|BASE|SET)$/i.test(e.tagName) || [...e.attributes].some(a => /^on/i.test(a.name) || /javascript:/i.test(a.value.replace(/\s/g, '')))).map(e => e.tagName)), []);
same('and nothing ran', await pg.evaluate(() => window.__x), 0);

// Dropped HTML arrives as plain text.
await load(pg, '<main><p id="t">drop here</p></main>');
await pg.evaluate(() => {
  const p = document.getElementById('t'), r = p.getBoundingClientRect(), dt = new DataTransfer();
  dt.setData('text/html', '<img src=x onerror="window.__x=9"><b>bold</b>'); dt.setData('text/plain', 'plain words');
  p.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true, clientX: r.right - 2, clientY: r.top + 5 }));
});
await sleep(300);
const d = await pg.evaluate(() => document.getElementById('doc').innerHTML);
check('dropped HTML arrives as plain text', d.includes('plain words') && !/<img|<b>/.test(d), d);

// The diagram editor still runs under the policy.
await load(pg, '<main><h1>T</h1><p>x</p></main>');
await pg.evaluate(() => document.querySelector('[data-a="diagram"]').click());
const ok = await waitFor(pg, () => { const f = document.getElementById('de-frame'); try { return !!(f.contentWindow.DiagramEditor && f.contentWindow.DiagramEditor.S.embed); } catch (e) { return false; } }, null, 15000);
check('diagram editor runs', !!ok);
same('no page errors', errors, []);
await b.close();
