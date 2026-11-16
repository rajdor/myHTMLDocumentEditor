// Runs every test/t*.mjs in order from the project root and reports failures. Output goes to test/out/results.txt.
// A test fails if it exits non-zero or prints a page error.
//   node test/run-all.mjs           run everything
//   node test/run-all.mjs t2 t6     run only these
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { ROOT } from './harness.mjs';

const only = process.argv.slice(2).map(a => a.replace(/\.mjs$/, '') + '.mjs');
const tests = fs.readdirSync(path.join(ROOT, 'test')).filter(f => /^t\d+[\w-]*\.mjs$/.test(f) && (!only.length || only.some(o => f === o || f.startsWith(o.replace('.mjs', '-')))))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)));
let failed = 0, log = '';
const t0 = Date.now();
for (const t of tests) {
  const r = spawnSync(process.execPath, [path.join('test', t)], { cwd: ROOT, encoding: 'utf8', timeout: 300000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const why = r.status !== 0 ? 'exit code ' + r.status : /PAGEERROR/.test(out) ? 'page error' : '';
  if (why) failed++;
  const n = (out.match(/^ok   /gm) || []).length, f = (out.match(/^FAIL /gm) || []).length;
  console.log((why ? 'FAIL ' : 'ok   ') + t.padEnd(28) + n + ' checks passed' + (f ? ', ' + f + ' failed' : '') + (why && !f ? '  (' + why + ')' : ''));
  log += '===== ' + t + (why ? ' FAIL: ' + why : ' ok') + '\n' + out + '\n';
}
fs.writeFileSync(path.join(ROOT, 'test', 'out', 'results.txt'), log);
console.log(tests.length - failed + '/' + tests.length + ' passed in ' + Math.round((Date.now() - t0) / 1000) + ' s; details in test/out/results.txt');
process.exit(failed ? 1 : 0);
