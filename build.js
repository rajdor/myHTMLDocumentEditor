// Builds the single self-contained notebook, fine-line-notebook.html, from src/ and vendor/.
// PRODUCT names what is built: the output file, the name shown in Help and the browser tab, and the prefix of its own browser storage.
//   node build.js
// vendor/diagram-editor.html is the built diagram editor (myDiagramer). Copy in a new build of it to update.
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const pkg = require('./package.json');
const PRODUCT = { file: 'fine-line-notebook.html', name: 'Fine Line notebook', key: 'fln' };
const src = (f) => fs.readFileSync(path.join(__dirname, 'src', f), 'utf8');

const fontB64 = fs.readFileSync(path.join(__dirname, 'node_modules/@fontsource/architects-daughter/files/architects-daughter-latin-400-normal.woff2')).toString('base64');
const diagramEditor = fs.readFileSync(path.join(__dirname, 'vendor', 'diagram-editor.html'));
const icons = JSON.parse(src('icons.json'));

// marked (Markdown import) is included whole, ahead of the editor's own code; it defines the global `marked`.
const markedJs = fs.readFileSync(path.join(__dirname, 'node_modules/marked/lib/marked.umd.js'), 'utf8').replace(/\/\/# sourceMappingURL=.*\s*$/, '');
const app = "'use strict';\nconst VERSION = " + JSON.stringify(pkg.version) + ", PRODUCT = " + JSON.stringify({ name: PRODUCT.name, key: PRODUCT.key }) + ";\n" + markedJs + "\n" + src('app.js').replace('/*CONVERT*/', () => src('convert.js')).replace('/*NOTEBOOK*/', () => src('notebook.js'));

const ICON_DIR = path.join(__dirname, 'node_modules/@phosphor-icons/core/assets/regular');
const icon = (n) => fs.readFileSync(path.join(ICON_DIR, n + '.svg'), 'utf8').replace(/\s*xmlns="[^"]*"/, '').replace('<svg', '<svg aria-hidden="true"').trim();

let html = src('index.html')
  .replace('{{product}}', PRODUCT.name)
  .replace(/\{\{ic:([a-z0-9-]+)\}\}/g, (m, n) => icon(n))
  .replace('/*DOC_CSS*/', () => src('doc.css').replace('/*FONT_B64*/', fontB64).replace(/\/\*FONTFILE:([@\w./-]+)\*\//g, (m, f) => fs.readFileSync(path.join(__dirname, 'node_modules', f)).toString('base64')).replace(/\/\*ICONURL:([a-z0-9-]+)\*\//g, (m, n) => 'url("data:image/svg+xml,' + encodeURIComponent(icon(n).replace(' aria-hidden="true"', ' xmlns="http://www.w3.org/2000/svg"')) + '")'))
  .replace('/*ED_CSS*/', () => src('editor.css'))
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
if (scripts(html).length !== 2) throw new Error('Expected two runnable scripts in the editor (icons and app)');

for (const ch of ['—', '–']) if (html.includes(ch)) throw new Error('Dash character found in the build');
const out = path.join(__dirname, PRODUCT.file);
fs.writeFileSync(out, html);
console.log('Built', out, 'v' + pkg.version, (html.length / 1024).toFixed(1) + ' KB (diagram editor ' + (diagramEditor.length / 1024).toFixed(0) + ' KB)');
