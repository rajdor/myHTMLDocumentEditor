// Runs the tests against both built programs and reports failures. Output goes to test/out/results.txt.
//   test/t*.mjs   shared editor tests: run against fine-line-editor.html and fine-line-notebook.html
//   test/nb*.mjs  notebook tests: run against fine-line-notebook.html only
// A test fails if it exits non-zero or prints a page error.
//   node test/run-all.mjs                      everything, both programs
//   node test/run-all.mjs --product=editor     one program (editor or notebook)
//   node test/run-all.mjs t2 t6 nb1            only these
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ROOT } from './harness.mjs';

const args = process.argv.slice(2), pick = (args.find(a => a.startsWith('--product=')) || '').slice(10);
if (pick && pick !== 'editor' && pick !== 'notebook') { console.error('--product must be editor or notebook'); process.exit(2); }
const only = args.filter(a => !a.startsWith('--')).map(a => a.replace(/\.mjs$/, '') + '.mjs');
const num = (f) => parseInt(f.replace(/^\D+/, ''));
const tests = fs.readdirSync(path.join(ROOT, 'test')).filter(f => /^(t|nb)\d+[\w-]*\.mjs$/.test(f) && (!only.length || only.some(o => f === o || f.startsWith(o.replace('.mjs', '-')))))
  .sort((a, b) => (a[0] === 'n') - (b[0] === 'n') || num(a) - num(b));
let failed = 0, ran = 0, log = '';
const t0 = Date.now();
for (const product of pick ? [pick] : ['editor', 'notebook']) {
  const mine = tests.filter(t => product === 'notebook' || t[0] !== 'n');
  if (!mine.length) continue;
  console.log('--- ' + product + ' (' + (product === 'notebook' ? 'fine-line-notebook.html' : 'fine-line-editor.html') + ')');
  for (const t of mine) {
    const r = spawnSync(process.execPath, [path.join('test', t)], { cwd: ROOT, encoding: 'utf8', timeout: 300000, env: { ...process.env, FL_PRODUCT: product } });
    const out = (r.stdout || '') + (r.stderr || '');
    const why = r.status !== 0 ? 'exit code ' + r.status : /PAGEERROR/.test(out) ? 'page error' : '';
    if (why) failed++; ran++;
    const n = (out.match(/^ok   /gm) || []).length, f = (out.match(/^FAIL /gm) || []).length;
    console.log((why ? 'FAIL ' : 'ok   ') + t.padEnd(28) + n + ' checks passed' + (f ? ', ' + f + ' failed' : '') + (why && !f ? '  (' + why + ')' : ''));
    log += '===== ' + product + ' ' + t + (why ? ' FAIL: ' + why : ' ok') + '\n' + out + '\n';
  }
}
fs.writeFileSync(path.join(ROOT, 'test', 'out', 'results.txt'), log);
console.log(ran - failed + '/' + ran + ' passed in ' + Math.round((Date.now() - t0) / 1000) + ' s; details in test/out/results.txt');
process.exit(failed ? 1 : 0);
