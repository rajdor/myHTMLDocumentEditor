// What the text editor uses from CodeMirror 6, gathered into one global (FLCM) by build-codemirror.js.
// The result is vendor/codemirror.js, which build.js puts inside the notebook; it is started the first time a text file is opened.
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, rectangularSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth } from '@codemirror/commands';
import { search, searchKeymap, highlightSelectionMatches, openSearchPanel } from '@codemirror/search';
import { syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit, StreamLanguage, ensureSyntaxTree } from '@codemirror/language';
import { tags, highlightTree } from '@lezer/highlight';
import { json } from '@codemirror/lang-json';
import { xml } from '@codemirror/lang-xml';
import { css } from '@codemirror/lang-css';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { sql } from '@codemirror/lang-sql';
import { yaml, yamlFrontmatter } from '@codemirror/lang-yaml';
import { markdown } from '@codemirror/lang-markdown';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { toml } from '@codemirror/legacy-modes/mode/toml';
import { properties } from '@codemirror/legacy-modes/mode/properties';

/* Windows batch files: CodeMirror has no mode for them, so this is a small one of our own. */
const BAT_WORDS = /^(?:if|else|for|in|do|goto|call|exit|set|setlocal|endlocal|echo|rem|pause|shift|not|exist|defined|errorlevel|equ|neq|lss|leq|gtr|geq|cd|chdir|md|mkdir|rd|rmdir|del|erase|copy|xcopy|robocopy|move|ren|rename|type|start|title|cls|pushd|popd|choice|timeout|where|find|findstr|nul|con|prn)\b/i;
const batch = {
  name: 'batch',
  startState: () => ({ lineStart: true, echo: false }),
  token(stream, state) {
    if (stream.sol()) { state.lineStart = true; state.echo = false; }
    if (stream.eatSpace()) return null;
    const first = state.lineStart; state.lineStart = false;
    if (first && stream.match(/^@?rem\b/i)) { stream.skipToEnd(); return 'comment'; }
    if (first && stream.match('::')) { stream.skipToEnd(); return 'comment'; }
    if (first && stream.match(/^:[^\s:]+/)) return 'labelName';
    if (first && stream.eat('@')) { state.lineStart = true; return 'operator'; }
    if (stream.match(/^%%~?[a-z]/i) || stream.match(/^%~?[\d*]/) || stream.match(/^%[^%\s]+%/) || stream.match(/^![^!\s]+!/)) return 'variableName.special';
    if (stream.eat('"')) { while (!stream.eol()) { const c = stream.next(); if (c === '"') break; } return 'string'; }
    if (stream.match(/^(?:&&|\|\||[&|<>()]|==)/)) { state.lineStart = true; state.echo = false; return 'operator'; }
    if (!state.echo && stream.match(/^\/[a-z?]+\b/i)) return 'attributeName';
    if (!state.echo && stream.match(/^\d+\b/)) return 'number';
    const w = stream.match(BAT_WORDS);
    if (w && !state.echo) { if (/^echo$/i.test(w[0])) state.echo = true; return 'keyword'; }
    if (!w) stream.next();
    return null;
  },
  languageData: { commentTokens: { line: 'rem ' } }
};
const legacy = (m) => () => StreamLanguage.define(m);
const LANGS = {
  json: () => json(), xml: () => xml(), css: () => css(), javascript: () => javascript(), jsx: () => javascript({ jsx: true }),
  typescript: () => javascript({ typescript: true }), tsx: () => javascript({ typescript: true, jsx: true }), python: () => python(), sql: () => sql(),
  yaml: () => yaml(), markdown: () => yamlFrontmatter({ content: markdown() }),   // front matter at the top of a Markdown file is coloured as YAML
  shell: legacy(shell), powershell: legacy(powerShell), batch: legacy(batch), toml: legacy(toml), properties: legacy(properties)
};
export { EditorState, Compartment, EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter, highlightSpecialChars, drawSelection, rectangularSelection,
  defaultKeymap, history, historyKeymap, indentWithTab, undo, redo, undoDepth, redoDepth, search, searchKeymap, highlightSelectionMatches, openSearchPanel,
  syntaxHighlighting, HighlightStyle, indentOnInput, bracketMatching, foldGutter, foldKeymap, indentUnit, tags, LANGS, ensureSyntaxTree, highlightTree };
