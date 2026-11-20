// Builds two self-contained programs from one source, src/ and vendor/:
//   fine-line-editor.html    the document editor on its own
//   fine-line-notebook.html  the same editor with the notebook explorer (src/notebook/) and Markdown import
// Everything outside src/notebook/ is shared, so a change there reaches both. Notebook code reaches the notebook only.
//   node build.js
// vendor/diagram-editor.html is the built diagram editor (myDiagramer). Copy in a new build of it to update.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const pkg = require('./package.json');
// title: the browser tab. label: the name beside the version in Help. key: prefix of the program's own browser storage.
const PRODUCTS = [
  { id: 'editor', file: 'fine-line-editor.html', title: 'Document editor', label: 'Editor', key: 'fle', notebook: false },
  { id: 'notebook', file: 'fine-line-notebook.html', title: 'Fine Line notebook', label: 'Fine Line notebook', key: 'fln', notebook: true },
];
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const fontB64 = fs.readFileSync(path.join(__dirname, 'node_modules/@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2')).toString('base64');
const diagramEditor = fs.readFileSync(path.join(__dirname, 'vendor', 'diagram-editor.html'));
const icons = JSON.parse(src('icons.json'));
// The emoji list on the toolbar. Written into the program as \u codes, so the list reads the same whatever encoding the file is opened with.
const emoji = JSON.parse(src('emoji.default.json')).emojis.map(e => { if (!e.char || !e.tooltip) throw new Error('An emoji needs a char and a tooltip: ' + JSON.stringify(e)); return { char: e.char, code: e.code, tooltip: e.tooltip }; });
const emojiJs = JSON.stringify(emoji).replace(/[^\x00-\x7F]/g, c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

// marked (Markdown import, notebook only) is included whole, ahead of the editor's own code; it defines the global `marked`.
const markedJs = fs.readFileSync(path.join(__dirname, 'node_modules/marked/lib/marked.umd.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*\s*$/, '');
// Notebook-only markup, in named parts; each goes where src/index.html has {{nb:name}}, followed by the white space that sat there.
const nbParts = Object.fromEntries(src('notebook/notebook.html').split(/<!--part:([a-z]+)-->\n/).slice(1).reduce((a, x, k, all) => (k % 2 ? a : [...a, [x, all[k + 1].replace(/\n$/, '')]]), []));
const NB_AFTER = { warn: '\n', panel: '\n', help: '\n  ' };

const ICON_DIR = path.join(__dirname, 'node_modules/@phosphor-icons/core/assets/regular');
const icon = (n, fill) => fs.readFileSync(path.join(ICON_DIR, fill ? '../fill' : '', n + (fill ? '-fill' : '') + '.svg'), 'utf8').replace(/\s*xmlns="[^"]*"/, '').replace('<svg', '<svg aria-hidden="true"').trim();

function build(PRODUCT) {
const app = "'use strict';\nconst VERSION = " + JSON.stringify(pkg.version) + ", PRODUCT = " + JSON.stringify({ id: PRODUCT.id, label: PRODUCT.label, key: PRODUCT.key }) + ", EMOJI = " + emojiJs + ";\n" + (PRODUCT.notebook ? markedJs + "\n" : '')
  + src('app.js').replace('/*CONVERT*/', () => src('convert.js') + '\n' + src('convert-drawings.js')).replace('/*NOTEBOOK*/', () => src(PRODUCT.notebook ? 'notebook/notebook.js' : 'notebook/none.js'));
let html = src('index.html')
  .replace('{{product}}', PRODUCT.title)
  .replace(/\{\{nb:([a-z]+)\}\}/g, (m, n) => { if (!(n in nbParts)) throw new Error('No notebook part named ' + n); return PRODUCT.notebook ? nbParts[n] + NB_AFTER[n] : ''; })
  .replace(/\{\{ic:([a-z0-9-]+)\}\}/g, (m, n) => icon(n))
  .replace(/\{\{icf:([a-z0-9-]+)\}\}/g, (m, n) => icon(n, true))   // the filled drawing of an icon
  .replace('/*DOC_CSS*/', () => src('doc.css').replace('/*FONT_B64*/', fontB64).replace(/\/\*FONTFILE:([@\w./-]+)\*\//g, (m, f) => fs.readFileSync(path.join(__dirname, 'node_modules', f)).toString('base64')).replace(/\/\*ICONURL:([a-z0-9-]+)\*\//g, (m, n) => 'url("data:image/svg+xml,' + encodeURIComponent(icon(n).replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"')) + '")'))
  .replace('/*ED_CSS*/', () => src('editor.css') + (PRODUCT.notebook ? src('notebook/notebook.css') : ''))
  .replace('/*DIAGRAM_EDITOR_B64*/', () => diagramEditor.toString('base64'))
  .replace('/*ICONS*/', () => JSON.stringify(icons))
  .replace('/*APP*/', () => app.replace(/<\/script/gi, '<\\/script'));

// Content Security Policy: only the editor's own scripts, and the diagram editor's, may run. They are allowed by hash,
// so a script, event handler or javascript: link that gets into an opened document is blocked by the browser.
const sha = (t) => "'sha256-" + crypto.createHash('sha256').update(t, 'utf8').digest('base64') + "'";
const scripts = (h) => [...h.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/gi)].filter(m => !/type\s*=\s*["']?text\/plain/i.test(m[1] || '')).map(m => m[2]);
const allowed = [...scripts(html), ...scripts(diagramEditor.toString('utf8'))].map(sha);
const csp = "default-src 'none'; script-src " + allowed.join(' ') + "; style-src 'unsafe-inline' data:; img-src data: blob:; font-src data:; connect-src data: blob:; frame-src 'self' blob: data:; child-src 'self' blob: data:; worker-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";
html = html.replace('/*CSP*/', csp);
if (scripts(html).length !== 2) throw new Error('Expected two runnable scripts in ' + PRODUCT.file + ' (icons and app)');
if (/\{\{(nb|icf?):[a-z0-9-]+\}\}|\{\{product\}\}/.test(html)) throw new Error('A placeholder was left in ' + PRODUCT.file);

for (const ch of ['—', '–']) if (html.includes(ch)) throw new Error('Dash character found in ' + PRODUCT.file);
const out = path.join(__dirname, PRODUCT.file);
fs.writeFileSync(out, html);
console.log('Built', out, 'v' + pkg.version, (html.length / 1024).toFixed(1) + ' KB (diagram editor ' + (diagramEditor.length / 1024).toFixed(0) + ' KB)');
}
PRODUCTS.forEach(build);
