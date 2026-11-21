// Builds vendor/codemirror.js: CodeMirror 6 and the languages the notebook's text editor colours, as one script that
// defines the global FLCM. Run it only after changing src/editors/codemirror-entry.mjs or updating CodeMirror:
//   node build-codemirror.js
// build.js then puts vendor/codemirror.js inside the notebook. The editor on its own does not carry it.
const esbuild = require('esbuild');
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, 'vendor', 'codemirror.js');
const ver = (p) => require(path.join(__dirname, 'node_modules', p, 'package.json')).version;
esbuild.buildSync({ entryPoints: [path.join(__dirname, 'src/editors/codemirror-entry.mjs')], bundle: true, minify: true, format: 'iife', globalName: 'FLCM', target: ['chrome110', 'safari16'], charset: 'ascii', legalComments: 'none', outfile: out });
const js = fs.readFileSync(out, 'utf8');
fs.writeFileSync(out, '/* CodeMirror ' + ver('codemirror') + ' (state ' + ver('@codemirror/state') + ', view ' + ver('@codemirror/view') + '), MIT licence, (c) Marijn Haverbeke and others. Built by build-codemirror.js. */\n' + js);
console.log('Built', out, (fs.statSync(out).size / 1024).toFixed(0) + ' KB');
