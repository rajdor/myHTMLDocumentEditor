// Structure: every toolbar command and key in every kind of block (paragraph, heading, list items, checklist, numbered,
// Q&A, header and body cells, box, code block) leaves a page the editor would make itself: no lists or tables inside
// paragraphs, no stray list items, no formatting in code, no leftover styling or empty formatting, no doubled formatting.
// Saving and reopening the result gives the same file. Set FL_EVERY=1 to try all four selections for every case.
import { open, check, same } from './harness.mjs';
import { matrix } from './structure-matrix.mjs';
const { b, pg, errors } = await open({ prompt: '2,2' });
const r = await matrix(pg, 'page', !!process.env.FL_EVERY);
check('every command was tried in every kind of block (' + r.n + ' cases)', r.n >= 400, r.n);
same('none of them leaves broken structure, and saving and reopening changes nothing', r.problems, []);
same('no errors in the page', errors, []);
await b.close();
