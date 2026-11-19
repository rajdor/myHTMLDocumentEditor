// Saved pages are plain ASCII bytes: other characters are written as HTML codes, so a reader that assumes the wrong
// encoding cannot garble them, and the page re-opens exactly as it was.
import { open, check, same, load, sleep } from './harness.mjs';

const { b, pg, errors } = await open();
const TEXT = 'Dash \u2014 and \u2013, arrow \u2192 \u21D2, quotes \u201Cq\u201D \u2018s\u2019, dots \u2026, name Zo\u00EB Mu\u00F1oz, 21\u00B0C, line \u2500\u2502, tick \u2713, emoji \u{1F600}, less \u2264';
await load(pg, '<main><h1>Caf\u00E9 \u2192 plan</h1><h2>R\u00E9sum\u00E9 \u2014 one</h2><p id="t"></p><pre>a \u2192 b</pre><table><tr><th>\u00D7</th><td>5\u00A0kg</td></tr></table><p><a href="https://example.com/caf\u00E9">link \u2192</a></p></main>');
await pg.evaluate((t) => { document.querySelector('#t').textContent = t; }, TEXT);
const out = await pg.evaluate(() => FLE.build());
const bytes = Buffer.from(out, 'utf8');
check('a saved page holds no byte outside plain ASCII', bytes.every(x => x < 128), [...new Set([...out].filter(c => c.codePointAt(0) > 127))]);
check('it still declares UTF-8', out.includes('<meta charset="utf-8">'));
check('common characters are written by name', ['&mdash;', '&ndash;', '&rarr;', '&rArr;', '&ldquo;', '&rdquo;', '&lsquo;', '&rsquo;', '&hellip;', '&euml;', '&ntilde;', '&deg;', '&le;', '&times;', '&nbsp;', '&eacute;'].every(e => out.includes(e)), out.match(/&[a-zA-Z]+;/g));
check('other characters are written by number, including ones beyond the basic plane', ['&#9472;', '&#9474;', '&#10003;', '&#128512;'].every(e => out.includes(e)));
check('the title, the index and link addresses are covered', /<title>Caf&eacute; &rarr; plan<\/title>/.test(out) && /R&eacute;sum&eacute; &mdash; one<\/a>/.test(out) && out.includes('href="https://example.com/caf&eacute;"'));
check('read with the wrong encoding, the text is the same', Buffer.from(out, 'latin1').toString('utf8') === out || bytes.toString('latin1') === out);
await load(pg, out, 'saved.html'); await sleep(200);
const back = await pg.evaluate(() => ({ t: document.querySelector('#t').textContent, h1: document.querySelector('#doc h1').textContent, pre: document.querySelector('#doc pre').textContent, td: document.querySelector('#doc td').textContent, href: document.querySelector('#doc a').getAttribute('href'), raw: document.querySelector('#doc').innerHTML.includes('&mdash;') }));
same('the page re-opens with every character as it was', [back.t, back.h1, back.pre, back.td, back.href], [TEXT, 'Caf\u00E9 \u2192 plan', 'a \u2192 b', '5\u00A0kg', 'https://example.com/caf\u00E9']);
check('in the editor the text holds the characters themselves, not codes', !back.raw);
const again = await pg.evaluate(() => FLE.build());
check('saving again gives the same file', again === out);
check('a page with only plain characters is unchanged by this', await pg.evaluate(() => { FLE.load('<main><h1>Plain</h1><p>a -> b &amp; c &lt; d</p></main>'); const o = FLE.build(); return o.includes('<p>a -&gt; b &amp; c &lt; d</p>'); }));
check('no page errors', errors.length === 0, errors);
await b.close();
