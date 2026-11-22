// Markdown structure: every command that a Markdown file keeps, in every kind of block, gives a page that writes and
// reads back as the same Markdown. Then a set of awkward Markdown files (lists next to each other, code in lists, nested
// emphasis, links with formatting, tables with pipes, entities, deep nesting) open and save without losing meaning,
// and saving a second time gives the same text.
import { open, check, same, sleep } from './harness.mjs';
import { installMockFs } from './mockfs.mjs';
import { matrix } from './structure-matrix.mjs';
const { b, pg, errors } = await open({ prompt: '2,2' });
await pg.evaluate(installMockFs);
await pg.evaluate(async () => { window.R = MFS.make({ 'f.md': '# T\n' }, 'N'); await FLE.NB.openRoot(R, false, true); }); await sleep(200);
await pg.evaluate(() => document.querySelector('.nb-row[title="f.md"]').click()); await sleep(400);
const r = await matrix(pg, 'md', !!process.env.FL_EVERY);
check('every command was tried in every kind of block (' + r.n + ' cases)', r.n >= 200, r.n);
same('none of them leaves broken structure, and writing and reading back changes nothing', r.problems, []);
const C = {
  'two bullet lists': '- a\n- b\n\n<!-- -->\n\n- c\n',
  'bullets then tasks': '- a\n- b\n\n* [ ] c\n* [x] d\n',
  'two numbered lists': '1. a\n2. b\n\n1) c\n2) d\n',
  'code in a list item': '- item\n\n  ```js\n  let x = 1;\n  ```\n\n- next\n',
  'list in a quote': '> - a\n> - b\n',
  'item with two paragraphs': '- first para\n\n  second para\n\n- next\n',
  'numbered in bullets': '- a\n  1. one\n  2. two\n- b\n',
  'nested task': '- [ ] parent\n  - [x] child\n',
  'bold and italic together': '***both*** and **bold *inner* bold** and *it **bo** it*\n',
  'link with bold': '[**bold link**](https://e.com) and **[link in bold](https://e.com)**\n',
  'code with a backtick': 'Use `` a`b `` here.\n',
  'heading with a link': '## See [docs](https://e.com) now\n',
  'break in an item': '- line one  \n  line two\n',
  'pipe in table code': '| A | B |\n| --- | --- |\n| `a\\|b` | x |\n',
  'strike with code': '~~gone `code` gone~~\n',
  'link with brackets': '[x](https://e.com/a_(b))\n',
  'entities': 'AT&amp;T and &copy; and 5 &lt; 6\n',
  'empty code block': '```\n```\n',
  'nested quote': '> outer\n>\n> > inner\n',
  'quote with a heading': '> ## Head\n>\n> text\n',
  'numbered from 0': '0. zero\n1. one\n',
  'deep nesting': '- a\n  - b\n    - c\n      - d\n',
  'picture in a link': '[![alt](p.png)](https://e.com)\n',
  'autolink': '<https://e.com>\n',
  'closing hashes': '## Title ##\n',
  'underscores in words': 'snake_case_name and __init__\n',
};
const out = await pg.evaluate((C) => {
  const res = {}, M = FLE.NB.MD;
  for (const [k, src] of Object.entries(C)) {
    try {
      const m = M.read(src); FLE.load('<main>' + m.html + '</main>', 'f.md', { asTyped: true });
      const w1 = M.write(document.querySelector('#doc').cloneNode(true), m);
      const m2 = M.read(w1); FLE.load('<main>' + m2.html + '</main>', 'f.md', { asTyped: true });
      const w2 = M.write(document.querySelector('#doc').cloneNode(true), m2);
      const norm = h => h.replace(/<!--[\s\S]*?-->/g, '').replace(/\s+/g, ' ');   // a comment that only separates two lists may come back as a change of marker
      res[k] = norm(m.html) !== norm(m2.html) ? 'meaning changed: ' + JSON.stringify(w1) : w1 !== w2 ? 'second save differs' : 'ok';
    } catch (e) { res[k] = 'error ' + e.message; }
  }
  return res;
}, C);
for (const [k, v] of Object.entries(out)) same('a Markdown file with ' + k + ' keeps its meaning and saves the same twice', v, 'ok');
same('no errors in the page', errors, []);
await b.close();
