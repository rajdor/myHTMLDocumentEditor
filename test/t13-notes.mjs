// Notes: a note covers whole blocks (or a table or diagram); a margin (hidden until switched on or a note is added) with a bar and a
// note icon beside each note; the icon opens the log over the margin without moving the page. Log lines: a date line,
// then "JB comment" lines; a date already in the log gets a new line under it. Selecting into a note grows it; an empty
// log removes the note; logs are closed on open and their state is not saved; a clean copy is offered after Save.
import { open, check, same, load, sleep, caretIn, click } from './harness.mjs';
const { b, pg, errors } = await open({ prompt: 'jb' });
const K = pg.keyboard, mod = process.platform === 'darwin' ? 'Meta' : 'Control';
const d = new Date(), z = n => String(n).padStart(2, '0'), TODAY = d.getFullYear() + '.' + z(d.getMonth() + 1) + '.' + z(d.getDate());
const sel = (a, b2) => pg.evaluate((a, b2) => { const x = document.querySelector(a), y = document.querySelector(b2), r = document.createRange(); r.setStart(x.firstChild, 1); r.setEnd(y.firstChild, 1); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }, a, b2);
const shape = () => pg.evaluate(() => [...document.getElementById('doc').children].map(n => n.classList.contains('note') ? 'NOTE[' + [...n.querySelector('.note-body').children].map(c => c.textContent).join(',') + ' | ' + [...n.querySelector('.note-entries').children].map(c => c.textContent.replace(/ /g, ' ').trim()).join(',') + ']' : n.textContent));
const margin = () => pg.evaluate(() => parseFloat(getComputedStyle(document.getElementById('doc')).paddingRight));
const openLogs = () => pg.evaluate(() => document.querySelectorAll('#doc .note-log[open]').length);

await load(pg, '<main><h1>T</h1><p id="a">Alpha</p><p id="b">Bravo</p><p id="c">Charlie</p><div class="tw"><table><tr><td id="cell">cell</td></tr></table></div><p id="e">Echo</p></main>');
const m0 = await margin();
await sel('#a', '#b'); await click(pg, 'note'); await sleep(50); await K.type('Check the figures');
same('note covers the selected blocks; log has the date, then initials and comment', await shape(), ['T', 'NOTE[Alpha,Bravo | ' + TODAY + ',JB Check the figures]', 'Charlie', 'cell', 'Echo']);
check('margin appears only once there is a note', m0 < 60 && (await margin()) > 200, [m0, await margin()]);
check('log is open while writing', (await openLogs()) === 1);
same('initials kept in the browser; the button is an icon with its hover text', await pg.evaluate(() => { const w = document.getElementById('who'); return [localStorage.getItem('fle-initials'), w.dataset.initials, !!w.querySelector('svg'), w.textContent.trim(), w.title]; }), ['JB', 'JB', true, '', 'Your initials for notes (kept in this browser only); click to change']);
const pos = await pg.evaluate(() => { const n = document.querySelector('.note'), sm = n.querySelector('summary'); return { gap: sm.getBoundingClientRect().left - n.querySelector('.note-body').getBoundingClientRect().right, top: Math.round(sm.getBoundingClientRect().top - n.getBoundingClientRect().top), next: document.querySelector('#c').getBoundingClientRect().top }; });
check('icon sits in the margin, level with the top of the note', pos.gap > 10 && pos.top === 0, pos);

await caretIn(pg, '#e'); await sleep(50);
check('clicking elsewhere closes the log', (await openLogs()) === 0);
const nextBefore = await pg.evaluate(() => document.querySelector('#c').getBoundingClientRect().top);
await pg.click('#doc .note-log > summary'); await sleep(50);
check('clicking the icon opens it', (await openLogs()) === 1);
same('an open log does not move the page', await pg.evaluate(() => document.querySelector('#c').getBoundingClientRect().top), nextBefore);
await K.press('Escape'); check('Escape closes it', (await openLogs()) === 0);

await caretIn(pg, '#a'); await click(pg, 'note'); await sleep(50); await K.type('Second'); await K.press('Enter'); await K.type('thought');
same('same date adds a line under it, and Enter in the log starts another initialled line', (await shape())[1], 'NOTE[Alpha,Bravo | ' + TODAY + ',JB Check the figures,JB Second,JB thought]');
await pg.evaluate(() => { document.querySelector('.note-date').textContent = '2026.01.02'; });
await caretIn(pg, '#b'); await click(pg, 'note'); await sleep(50); await K.type('Later');
same('another date starts a new date line', (await shape())[1], 'NOTE[Alpha,Bravo | 2026.01.02,JB Check the figures,JB Second,JB thought,' + TODAY + ',JB Later]');

await sel('#b', '#c'); await click(pg, 'note'); await sleep(50); await K.type('Grown');
same('selecting into a note grows it', (await shape())[1], 'NOTE[Alpha,Bravo,Charlie | 2026.01.02,JB Check the figures,JB Second,JB thought,' + TODAY + ',JB Later,JB Grown]');

await caretIn(pg, '#c'); await K.press('Enter'); await K.type('Delta');
check('Enter inside a note adds a line inside it', (await shape())[1].includes('Charlie,Delta |'));
await K.press('Enter'); await K.press('Enter'); await K.type('Outside');
same('Enter on an empty last line steps out', (await shape())[2], 'Outside');

await caretIn(pg, '#cell'); await click(pg, 'note'); await sleep(50); await K.type('Table note');
check('a table can be noted', (await shape()).some(x => x === 'NOTE[cell | ' + TODAY + ',JB Table note]'));
check('opening one log closes the other', (await openLogs()) === 1);

const out = await pg.evaluate(() => FLE.build());
check('saved with notes, all logs closed', (out.match(/class="note"/g) || []).length === 2 && out.includes('Table note') && !/note-log" open|<details[^>]*open/.test(out));
const cleanOut = await pg.evaluate(() => FLE.build({ noNotes: true }));
check('clean copy has no notes and keeps the blocks', !/class="note/.test(cleanOut) && cleanOut.includes('Alpha') && cleanOut.includes('cell'));
await load(pg, out); same('logs are closed when a document opens', await openLogs(), 0);

await pg.evaluate(() => { window.showSaveFilePicker = async () => ({ name: 'doc.html', createWritable: async () => ({ write: async () => { }, close: async () => { } }) }); });
await click(pg, 'save'); await sleep(200);
check('after Save, a clean copy is offered', await pg.evaluate(() => !document.getElementById('cleanbar').hidden));
await click(pg, 'noclean'); check('and can be declined', await pg.evaluate(() => document.getElementById('cleanbar').hidden));
// the saved line, and the x on each bar
const bars = () => pg.evaluate(() => [!document.getElementById('savedbar').hidden, document.getElementById('savedmsg').textContent, !document.getElementById('cleanbar').hidden]);
same('after Save, a line names the file saved', await bars(), [true, 'File saved: doc.html', false]);
await click(pg, 'save'); await sleep(200);
await pg.click('#cleanbar button.x'); await sleep(50);
same('the x on the clean copy bar does what Not now does, and leaves the saved line', await bars(), [true, 'File saved: doc.html', false]);
await pg.click('#savedbar button.x'); await sleep(50);
same('the saved line has its own x', (await bars())[0], false);
await pg.evaluate(() => { window.showSaveFilePicker = async o => ({ name: o.suggestedName, createWritable: async () => ({ write: async () => { }, close: async () => { } }) }); });
await click(pg, 'save'); await sleep(200); await click(pg, 'saveclean'); await sleep(200);
same('saving a clean copy names that file', await bars(), [true, 'File saved: doc-clean.html', false]);
await pg.evaluate(() => { delete window.showSaveFilePicker; window.showSaveFilePicker = undefined; document.querySelector('[data-a="saveas"]').click(); }); await sleep(300);
check('a save by download says so', /^File saved to the browser's downloads folder: /.test((await bars())[1]), (await bars())[1]);
await pg.evaluate(() => { window.showSaveFilePicker = async () => ({ name: 'doc.html', createWritable: async () => ({ write: async () => { }, close: async () => { } }) }); document.querySelector('[data-a="new"]').click(); }); await sleep(100);
same('a new document clears both bars', [(await bars())[0], (await bars())[2]], [false, false]);
await load(pg, out);

await pg.evaluate(() => { const n = [...document.querySelectorAll('.note')].find(n => n.textContent.includes('Table note')); n.querySelectorAll('.note-entries p:not(.note-date)').forEach(p => { p.innerHTML = '<b class="note-who">JB</b>&nbsp;'; }); });
await caretIn(pg, '#e'); await sleep(100);
check('a note with no comments left is removed and its blocks stay', (await shape()).includes('cell') && (await shape()).filter(x => x.startsWith('NOTE')).length === 1);
await K.down(mod); await K.press('z'); await K.up(mod); await sleep(100);
check('undo brings it back', (await shape()).filter(x => x.startsWith('NOTE')).length === 2);

// notes in the earlier form are upgraded on open
await load(pg, '<main><div class="note"><div class="note-body"><p>Old</p></div><aside class="note-log"><p class="note-stamp">AK 2026.11.14</p><p>Earlier comment</p></aside></div></main>');
same('notes in the earlier form are upgraded', await shape(), ['NOTE[Old | 2026.11.14,AK Earlier comment]']);
// the notes margin: hidden by default even when there are notes; the button shows and hides it; saved with the document
const view = () => pg.evaluate(() => { const b = document.querySelector('[data-a="margin"]'); return { pad: parseFloat(getComputedStyle(document.getElementById('doc')).paddingRight) > 200, icon: getComputedStyle(document.querySelector('#doc .note-log')).display !== 'none', bar: getComputedStyle(document.querySelector('#doc .note'), '::after').display !== 'none', on: b.classList.contains('on'), dot: b.classList.contains('has') }; });
same('a document with notes opens with the margin hidden, and the button flags the notes', await view(), { pad: false, icon: false, bar: false, on: false, dot: true });
check('hidden notes are still saved', (await pg.evaluate(() => FLE.build())).includes('Earlier comment') && !(await pg.evaluate(() => FLE.build())).includes('<main class="notes-on">'));
await click(pg, 'margin'); await sleep(50);
same('the button shows the margin', await view(), { pad: true, icon: true, bar: true, on: true, dot: false });
const shown = await pg.evaluate(() => FLE.build());
check('the choice is saved with the document', shown.includes('<main class="notes-on">'));
check('a clean copy does not carry the margin', !(await pg.evaluate(() => FLE.build({ noNotes: true }))).includes('<main class="notes-on">'));
await click(pg, 'margin'); await sleep(50);
same('and hides it again', await view(), { pad: false, icon: false, bar: false, on: false, dot: true });
await load(pg, shown); same('a document saved with the margin on opens with it on', await view(), { pad: true, icon: true, bar: true, on: true, dot: false });
await pg.evaluate(() => document.querySelector('[data-a="new"]').click()); await sleep(100);
check('a new document starts with the margin off', await pg.evaluate(() => !document.getElementById('doc').classList.contains('notes-on')));
await load(pg, shown.replace('<main class="notes-on">', '<main>')); await caretIn(pg, '#doc .note-body p'); await click(pg, 'note'); await sleep(50);
check('adding a note switches the margin on', (await view()).pad && (await openLogs()) === 1);
await caretIn(pg, '#doc .note-body p'); await pg.emulateMediaType('print'); await pg.evaluate(() => window.dispatchEvent(new Event('beforeprint'))); await sleep(50);
check('printing shows every log', await pg.evaluate(() => getComputedStyle(document.querySelector('.note-entries')).display !== 'none' && document.querySelector('.note-log').open));
await pg.emulateMediaType('screen');
same('no page errors', errors, []);
await b.close();
