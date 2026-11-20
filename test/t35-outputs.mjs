// The two built programs: the editor carries no notebook code, the notebook carries all of it, and both are
// self-contained and write the same page format. Reads the built files; no browser.
import fs from 'fs';
import path from 'path';
import { ROOT, check, same } from './harness.mjs';

const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const editor = read('fine-line-editor.html'), notebook = read('fine-line-notebook.html');
const NB_ONLY = { 'the explorer panel': 'id="nb"', 'the explorer tab': 'id="nb-tab"', 'the explorer styles': '#nb-tree', 'the explorer code': 'showDirectoryPicker', 'the Markdown converter': 'marked v', 'the Notebook help card': '<span>Notebook</span>' };

for (const [what, mark] of Object.entries(NB_ONLY)) {
  check('the editor does not contain ' + what, !editor.includes(mark));
  check('the notebook contains ' + what, notebook.includes(mark));
}
same('the browser tab names each program', [editor.match(/<title>([^<]*)<\/title>/)[1], notebook.match(/<title>([^<]*)<\/title>/)[1]], ['Document editor', 'Fine Line notebook']);
check('each program keeps its unsaved draft under its own key', /PRODUCT = \{[^}]*"key":"fle"/.test(editor) && /PRODUCT = \{[^}]*"key":"fln"/.test(notebook));
check('both write the same page format marker', [editor, notebook].every(h => h.includes('<meta name="generator" content="fine-line-editor">')));
check('both carry a Content Security Policy that allows no outside source', [editor, notebook].every(h => /Content-Security-Policy" content="default-src 'none'; script-src 'sha256-/.test(h)));
check('neither has a placeholder left from the build', [editor, notebook].every(h => !/\{\{(nb|icf?):[a-z0-9-]+\}\}|\{\{product\}\}|\/\*NOTEBOOK\*\//.test(h)));
check('neither loads anything from the network', [editor, notebook].every(h => !/<(script|link|img)[^>]+(src|href)="https?:/i.test(h)));
const bar = (h) => (h.match(/<div class="row" id="tbar">[\s\S]*?<div class="row" id="gbar"/) || [''])[0];
check('the toolbar is the same in both, button for button', bar(editor).length > 1000 && bar(editor) === bar(notebook));
check('both carry the same emoji list', [editor, notebook].every(h => / EMOJI = \[\{"char":/.test(h)) && editor.match(/ EMOJI = (\[.*?\]);/)[1] === notebook.match(/ EMOJI = (\[.*?\]);/)[1]);
check('the notebook is the larger file', notebook.length > editor.length, [editor.length, notebook.length]);
