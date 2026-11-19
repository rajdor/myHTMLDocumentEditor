// Runs the tests against both built programs and reports failures. Output goes to test/out/results.txt.
//   test/t*.mjs   shared editor tests: run against fine-line-editor.html and fine-line-notebook.html
//   test/nb*.mjs  notebook tests: run against fine-line-notebook.html only
// Tests run several at a time, each in its own browser. A test fails if it exits non-zero or prints a page error.
// A test that fails while others were running is run once more on its own, since the tests wait fixed times and a busy
// machine can make one late; if it passes then, it is reported as "ok (on its own)".
//   node test/run-all.mjs                      everything, both programs
//   node test/run-all.mjs --product=editor     one program (editor or notebook)
//   node test/run-all.mjs --jobs=1             one test at a time (default: one for each processor, at most 4)
//   node test/run-all.mjs t2 t6 nb1            only these
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ROOT } from './harness.mjs';

const args = process.argv.slice(2), opt = (k) => (args.find(a => a.startsWith('--' + k + '=')) || '').slice(k.length + 3);
const pick = opt('product');
if (pick && pick !== 'editor' && pick !== 'notebook') { console.error('--product must be editor or notebook'); process.exit(2); }
const jobs = Math.max(1, parseInt(opt('jobs')) || Math.min(4, Math.max(1, os.cpus().length)));
const only = args.filter(a => !a.startsWith('--')).map(a => a.replace(/\.mjs$/, '') + '.mjs');
const num = (f) => parseInt(f.replace(/^\D+/, ''));
const tests = fs.readdirSync(path.join(ROOT, 'test')).filter(f => /^(t|nb)\d+[\w-]*\.mjs$/.test(f) && (!only.length || only.some(o => f === o || f.startsWith(o.replace('.mjs', '-')))))
  .sort((a, b) => (a[0] === 'n') - (b[0] === 'n') || num(a) - num(b));
const FILE = { editor: 'fine-line-editor.html', notebook: 'fine-line-notebook.html' };
const runs = (pick ? [pick] : ['editor', 'notebook']).flatMap(product => tests.filter(t => product === 'notebook' || t[0] !== 'n').map(t => ({ product, t })));

const run = (r) => new Promise(done => {
  let out = ''; const c = spawn(process.execPath, [path.join('test', r.t)], { cwd: ROOT, env: { ...process.env, FL_PRODUCT: r.product } });
  const timer = setTimeout(() => c.kill(), 300000);
  c.stdout.on('data', d => { out += d; }); c.stderr.on('data', d => { out += d; });
  c.on('close', code => { clearTimeout(timer); done({ out, why: code !== 0 ? 'exit code ' + code : /PAGEERROR/.test(out) ? 'page error' : '' }); });
});
const t0 = Date.now();
let next = 0;
await Promise.all(Array.from({ length: Math.min(jobs, runs.length) }, async () => { while (next < runs.length) { const r = runs[next++]; Object.assign(r, await run(r)); process.stdout.write(r.why ? 'F' : '.'); } }));
process.stdout.write('\n');
if (jobs > 1) for (const r of runs.filter(r => r.why)) { const again = await run(r); if (!again.why) Object.assign(r, again, { alone: true }); }

let failed = 0, log = '', last = '';
for (const r of runs) {
  if (r.product !== last) { console.log('--- ' + r.product + ' (' + FILE[r.product] + ')'); last = r.product; }
  if (r.why) failed++;
  const n = (r.out.match(/^ok   /gm) || []).length, f = (r.out.match(/^FAIL /gm) || []).length;
  console.log((r.why ? 'FAIL ' : 'ok   ') + r.t.padEnd(28) + n + ' checks passed' + (f ? ', ' + f + ' failed' : '') + (r.why && !f ? '  (' + r.why + ')' : '') + (r.alone ? '  (on its own)' : ''));
  log += '===== ' + r.product + ' ' + r.t + (r.why ? ' FAIL: ' + r.why : ' ok') + (r.alone ? ' (on its own)' : '') + '\n' + r.out + '\n';
}
fs.writeFileSync(path.join(ROOT, 'test', 'out', 'results.txt'), log);
console.log(runs.length - failed + '/' + runs.length + ' passed in ' + Math.round((Date.now() - t0) / 1000) + ' s, ' + jobs + ' at a time; details in test/out/results.txt');
process.exit(failed ? 1 : 0);
