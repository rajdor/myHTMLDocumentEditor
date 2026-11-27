// App theme: the editor's own controls (toolbar, bars, notebook panel, menus) follow the chosen theme; the document keeps its own
// Fine Line style. Chosen in the Help window (the toolbar has no room for another button at 1440 wide). Material Design unless chosen; the choice is kept in this browser and is passed to the diagram editor and
// Data Model Studio when they open.
import { open, check, same, sleep, failures, IS_NOTEBOOK } from './harness.mjs';

const { b, pg, errors } = await open();
const st = () => pg.evaluate(() => {
  const cs = (q, p) => { const e = document.querySelector(q); return e ? getComputedStyle(e)[p] : null; };
  return { theme: document.documentElement.dataset.appTheme || 'blueprint', chrome: cs('#chrome', 'backgroundColor'), btn: cs('#chrome button.ic', 'borderRadius'), doc: cs('#doc', 'backgroundColor'), docInk: cs('#doc', 'color'), docFont: cs('#doc', 'fontFamily') };
});

const s0 = await st();
same('1 Material Design by default', s0.theme, 'material');
check('1b no extra toolbar button', await pg.$('#chrome [data-a="apptheme"]') === null);
const pick = async () => { if (!(await pg.evaluate(() => document.querySelector('#help').open))) await pg.click('[data-a="help"]'); await sleep(150); await pg.click('#help [data-a="apptheme"]'); await sleep(100); };

await pick();
check('1c the App theme button is in the Help window', await pg.$('#help #apptheme-pop') !== null);
const items = await pg.$$eval('#apptheme-pop button', bs => bs.map(x => ({ t: x.textContent.replace('✓', ''), on: x.getAttribute('aria-checked') })));
same('2 the picker lists the themes', items.length, 10);
same('2b the tick is on the current theme', items.filter(i => i.on === 'true').map(i => i.t), ['Material Design']);

// Pick Studio dark: the chrome goes dark, the document does not change
await pg.evaluate(() => [...document.querySelectorAll('#apptheme-pop button')].find(x => /Studio dark/.test(x.textContent)).click()); await sleep(100);
const s1 = await st();
same('3 Studio dark chosen', s1.theme, 'studio-dark');
same('3b the picker closes and Help stays open', [await pg.$('#apptheme-pop'), await pg.evaluate(() => document.querySelector('#help').open)], [null, true]);
check('3c the toolbar is dark', s1.chrome === 'rgb(22, 25, 31)', s1.chrome);
same('3d the document keeps its style', [s1.doc, s1.docInk, s1.docFont], [s0.doc, s0.docInk, s0.docFont]);
same('3e kept in this browser', await pg.evaluate(() => localStorage.getItem('fl-app-theme')), 'studio-dark');

await pick();
same('4 the tick moves', await pg.$$eval('#apptheme-pop button[aria-checked="true"]', bs => bs.map(x => x.textContent.replace('✓', ''))), ['Studio dark']);
await pg.click('#help .help-info, #help-info'); await sleep(100);
same('4b a click elsewhere closes it', await pg.$('#apptheme-pop'), null);

// Survives a reload
await pg.reload(); await sleep(500);
same('5 the choice survives a reload', (await st()).theme, 'studio-dark');

// Blueprint is the Fine Line look the editor always had
await pick();
await pg.evaluate(() => [...document.querySelectorAll('#apptheme-pop button')].find(x => /Blueprint/.test(x.textContent)).click()); await sleep(100);
const s2 = await st();
same('6 Blueprint: the original look', [s2.theme, s2.chrome, s2.btn], ['blueprint', 'rgb(255, 255, 255)', '3px']);

// An unknown stored value falls back to Material
await pg.evaluate(() => localStorage.setItem('fl-app-theme', 'nonsense')); await pg.reload(); await sleep(500);
same('7 an unknown theme falls back to Material', (await st()).theme, 'material');

if (IS_NOTEBOOK) {
  await pg.evaluate(() => localStorage.setItem('fl-app-theme', 'midnight')); await pg.reload(); await sleep(500);
  const nb = await pg.evaluate(() => { const e = document.querySelector('#nb'); return e ? getComputedStyle(e).backgroundColor : null; });
  same('8 the notebook panel follows the theme', nb, 'rgb(24, 33, 63)');
}

same('no page errors', errors, []);
await b.close();
process.exit(failures() ? 1 : 0);
