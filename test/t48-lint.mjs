// Code checks: each program's script, joined as build.js joins it, passes ESLint's recommended rules (names that are not
// defined, keys given twice, code that cannot run, invisible characters in the code, and the like). The script of the
// page (src/index.html) defines $, $$ and ICONS; marked and Turndown are included whole ahead of the notebook's code.
import { check, same, ROOT, IS_NOTEBOOK } from './harness.mjs';
import fs from 'fs';
import path from 'path';
import { ESLint } from 'eslint';
import js from '@eslint/js';
import globals from 'globals';
const src = f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8');
const editors = IS_NOTEBOOK ? ['text', 'markdown'] : [];
const code = "'use strict';\nconst VERSION = '0', FIT_HASH = '', PRODUCT = {}, EMOJI = [];\n" + src('app.js').replace('/*CONVERT*/', () => src('convert.js') + '\n' + src('convert-drawings.js'))
  .replace('/*NOTEBOOK*/', () => IS_NOTEBOOK ? editors.map(e => src('editors/' + e + '.js')).join('\n') + '\n' + src('notebook/notebook.js') : src('notebook/none.js'));
const eslint = new ESLint({ overrideConfigFile: true, overrideConfig: [js.configs.recommended, { languageOptions: { ecmaVersion: 2024, sourceType: 'script', globals: { ...globals.browser, $: 'readonly', $$: 'readonly', ICONS: 'readonly', marked: 'readonly', TurndownService: 'readonly', FLCM: 'readonly' } },
  rules: { 'no-empty': 'off', 'no-unused-vars': 'off', 'no-useless-escape': 'off', 'no-control-regex': 'off', 'no-cond-assign': ['error', 'except-parens'], 'no-redeclare': ['error', { builtinGlobals: false }] } }] });
const [r] = await eslint.lintText(code, { filePath: path.join(ROOT, 'src', 'app.js') });
const lines = code.split('\n'), where = n => 'line ' + n + ' of the joined script: ' + (lines[n - 1] || '').trim().slice(0, 80);
same('the ' + (IS_NOTEBOOK ? 'notebook' : 'editor') + ' script passes ESLint\'s recommended rules', r.messages.filter(m => m.severity === 2).map(m => m.ruleId + ' ' + m.message + ' (' + where(m.line) + ')'), []);
check('it holds no invisible characters typed into the code (written as \\u codes instead)', !/[\u00a0\u200b\ufeff\u2028\u2029\u202f\u3000]/.test(code));
