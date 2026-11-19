# Fine Line

Two offline, single-file programs built from one source:

| File | What it is |
|---|---|
| `fine-line-editor.html` | The Fine Line document editor: open, write and save one HTML document at a time |
| `fine-line-notebook.html` | Fine Line notebook: the same editor with an explorer panel that turns a folder into a notebook of pages |

Documents are written in the Fine Line Blueprint style: what you see while editing is what the saved document looks like. Diagrams are drawn in the built-in diagram editor (myDiagramer). Both programs write the same page format and open each other's pages.

Open either file in Chrome or Edge. Nothing is loaded from the network.

Everything outside `src/notebook/` is shared, so a change to the editor reaches both programs. Code in `src/notebook/` reaches the notebook only. `npm run build` always builds both.

`candy-shop-sop.html` is an example document that uses every kind of content the editor makes. Open it in a browser to read it, or in the editor to change it.

## What it does

- Text: heading levels H1 (title) to H4, H1 and H2 subtitles, lead paragraph, caption, code blocks, bold, italic, lists, checklists (real checkboxes, so saved documents need no script), compact lists, Q&A lists, boxes for the reader (Note, Information, Tip, Warning, Critical; inserted empty, they hold whole blocks and have an editable label), links and ID tags. H2 headings are numbered.
- Clear format: removes all text formatting from the selected text, including inline code, superscript, subscript and anything pasted in; with the cursor only, or a whole block selected, the block also becomes a plain paragraph (a plain line inside a table cell or list item). Links and ID tags stay.
- More formats: superscript, subscript, strike-through and inline code from one toolbar list.
- List indent and outdent: buttons, or Tab and Shift+Tab; outdent at the top level turns the item into a paragraph.
- Start numbering at: sets the first number of a numbered list so it can carry on from an earlier list; the number is fixed once set, and pasted lists keep theirs.
- Links: a form for the display text and the address, with defaults from the selected text and, when the browser already allows it, the clipboard.
- Inspect formatting: a button opens a popup that lists the formatting on the text at the cursor or the selected word, marks anything the toolbar cannot make there, shows the font, size, weight and colour, and can remove one format at a time. It reads the document only when pressed.
- Copy format: a format painter for block style, bold, italics and ID tags; one press applies once, a double-click keeps it on.
- Repeat last toolbar command: Option+Q on a Mac or Alt+Q on Windows applies the last toolbar command again at the cursor or on the selection; holding Option or Alt while you click or drag does the same in one move, and the Repeat button beside Redo names the command. It covers the Style list, bold, italic, lists, code block, ID tag, Note, Clear format and the table buttons, and it sets rather than toggles.
- Clipboard: copy, cut and paste keep formatting. Content copied in the editor pastes as it was; content from other programs keeps its structure and takes the document's style, through the same cleaning as Open.
- Tables: Table and Fancy Table (headings across the top, labels down the side, outlined). Add rows above or below and columns left or right, delete rows and columns, merge right, merge down, merge a selected block, split, compact. Set any row or column as a header or a sub header. Drag the border between two columns to resize them (the table keeps its width; double-click a border for automatic widths). Shift+click or drag across cells to select a column, a row or a block of cells for formatting, copying or deleting. Enter, Tab and the arrow keys work cell by cell.
- Diagrams: Diagram opens the diagram editor in front of the document; Done places the diagram, Cancel discards changes. Double-click a diagram, or select it and press Enter, to edit it again.
- Notes: a margin with a bar and icon beside each noted block; the icon opens a dated log of initialled comments. The margin is hidden by default; the Notes margin button shows or hides it, and the choice is saved with the document. A clean copy without notes is offered after Save.
- Links: shown in the browser's own style (blue, underlined). Web images, video and audio become link cards, so nothing is downloaded on open. Ctrl or Cmd + click opens a link.
- Fonts: Instrument Sans for body text, JetBrains Mono for code blocks and ID tags, Architects Daughter for the title and headings. All three are embedded in the editor and in each saved document, so nothing is downloaded and a document looks the same on any computer.
- Index: built from the headings, showing 1, 2 or 3 levels (H2 to H4). The setting is saved with the document; the default is 1.
- Notebook (`fine-line-notebook.html` only): an explorer panel, opened from the tab at the left edge, turns a folder on disk into a notebook, with folders as sections and files as pages. Open, create, rename, move and delete pages from the tree; deleted items go to a `.trash` folder in the notebook and can be restored. Markdown and plain text files open as an import (Markdown is converted by marked) and save as a new HTML page beside the original. Chrome and Edge save straight into the folder; other browsers get a read-only tree and Save downloads. History: a full copy of a page goes into `.history/<page path>/` each time a save replaces an earlier version, and every 5 minutes while the page has unsaved changes; nothing is written when nothing changed. Page history restores a copy, and unsaved work is offered back when the page is next opened. A status line shows the size of history and trash and opens a clean-up dialog. `.notebook/settings.json` can set `historyMinutes` (default 5), `historyNoteMB` (50) and `historyWarnMB` (100). See `docs/notebook-explorer-spec.md` for the full design and what is still to be built.
- Files: Save writes one self-contained HTML document that opens in any browser and re-opens here. A saved document holds only plain ASCII bytes: any other character (a dash, an arrow, an accented letter) is written as its HTML code, so the page looks the same but cannot be garbled by a program that reads the file with the wrong encoding. After a save, a line names the file saved; a dot on the Save button means there are unsaved changes. New and Open ask first when there are unsaved changes.
- Older formats: documents made with grids open as tables, and a diagram drawn directly on the page converts to a diagram-editor diagram when you double-click it.
- Toolbar: Phosphor icons grouped as File, History, Text, Lists, Insert, Notes, Index and Table, with the initials button and Help at the far right; hover for a description. Insert table and Insert fancy table are always shown; the row, column, header, merge and compact buttons appear to their right only while the cursor is in a table.
- Help: a dialog box with one card per topic. It also shows the editor version and the document name.
- Safety: no script from a document runs. Documents are cleaned on open, and a Content Security Policy allows only the editor's own scripts.

## How a diagram is stored

```html
<div class="dg" data-drawio="...draw.io XML...">
  <svg viewBox="..."> ...the picture... </svg>
</div>
```

The SVG is what readers see: it scales, prints and keeps its text searchable. The `data-drawio` source is what the diagram editor re-opens. Every id in the SVG carries a unique prefix, so several diagrams share one page safely.

## Project layout

| Path | Contents |
|---|---|
| `fine-line-editor.html` | The built document editor; this one file is all a user needs |
| `fine-line-notebook.html` | The built notebook; this one file is all a user needs |
| `candy-shop-sop.html` | Example document: a standard operating procedure that uses every kind of content the editor makes |
| `THIRD-PARTY-NOTICES.md` | Copyright notices and licence texts for the icons, fonts and libraries the two programs include |
| `src/index.html` | Shared page template: toolbar, help, overlay; `{{nb:...}}` marks where notebook markup goes |
| `src/app.js` | Shared editor behaviour |
| `src/convert.js` | Converts diagrams drawn directly on the page (the older format) to draw.io for the diagram editor |
| `src/notebook/notebook.js` | Notebook only: the explorer (folder tree, page files, trash, import) |
| `src/notebook/notebook.html` | Notebook only: the explorer's markup, in named parts |
| `src/notebook/notebook.css` | Notebook only: the explorer's styles |
| `src/notebook/none.js` | Editor only: the few notebook questions the shared code asks, all answered no |
| `src/doc.css` | Document styles; these are written into every saved document |
| `src/editor.css` | Editing-only styles; never saved |
| `src/icons.json` | Phosphor state icons used in diagrams |
| `vendor/diagram-editor.html` | The built diagram editor from myDiagramer, embedded at build time |
| `docs/notebook-explorer-spec.md` | Specification for the notebook explorer |
| `spike/folder-spike.html` | Throwaway page used to confirm folder access from a `file://` page |
| `build.js` | Builds `fine-line-editor.html` and `fine-line-notebook.html` |
| `test/` | Regression tests: `t*.mjs` are shared and run against both programs, `nb*.mjs` run against the notebook only; `test/files/legacy-document.html` is a small document in the older format used by t4 and t7; `test/mockfs.mjs` is an in-memory folder for the notebook tests |
| `CHANGELOG.md` | What changed in each version |

## Build and test

```
npm install
npm run build
npm test
```

Tests use puppeteer-core with a local Chrome or Edge (or `CHROME_PATH`). `npm test` runs every `test/t*.mjs` against both programs, then every `test/nb*.mjs` against the notebook. `npm run test:editor` and `npm run test:notebook` run one program; `node test/run-all.mjs t6 nb1` runs only those tests. Each test prints one line per check, and the full output goes to `test/out/results.txt`.

| Test | Covers |
|---|---|
| t1-text | Style list, index, labels as typed, Q&A lists |
| t2-tables | Rows above and below, columns left and right, deletes, merge, split, refused merges, Fancy Table |
| t3-cells | Enter, Shift+Enter, paste, Tab, Shift+Tab, Up and Down in cells |
| t4-migrate | Documents made with grids open as tables |
| t5-saveload | Saved file is self-contained, clean and re-opens unchanged |
| t6-diagram | Diagram editor overlay, Done, Cancel, edit, unique ids, save and re-open, delete |
| t7-page-diagram | Diagrams drawn on the page convert and open in the diagram editor; no editing in place |
| t8-diagram-text-size | Size changes selected label text in the diagram editor, inside the document editor |
| t9-headings-code | Heading levels and subtitles, index levels (saved, default 1), code blocks, Clear format |
| t10-history-safety | Undo and redo of structural changes and by word, plain paragraph after subtitles, Clear format keeps icons, opening a document runs no scripts, unique heading ids, Restore with no draft, headings before the first H2 in the index, web images not fetched |
| t11-no-scripts | Content Security Policy blocks document scripts even past the cleaning, opened documents are cleaned, dropped HTML becomes text, diagram editor still runs |
| t12-links | Nothing downloaded on open, web media become link cards, saved links, click and hover, Link form: display text and address, defaults from the selected text and the clipboard, edit, refuse, remove |
| t13-notes | Notes on blocks, tables and diagrams; margin hidden by default, shown by the button or by adding a note, saved with the document; icon opens the log without moving the page; date and initialled lines; growing; Enter in and out; removal when empty; closed on open, not saved open; clean copy offer and the saved line; undo; earlier note form upgraded; print |
| t14-clipboard | Copy, cut and paste keep formatting: inline, blocks, lists, tables, cells; notes left behind; undo; cleaning of HTML from other programs |
| t15-new-help | New asks before discarding unsaved changes (new and opened documents, every kind of change); Help dialog at the far right with the editor version and document name; the cursor stays in the document after a toolbar list is used; initials button |
| t16-copy-format | Copy format: block style by a click, inline formatting onto a selection, list items and cells, code, links, several blocks, once or kept on, undo |
| t17-clear-format | Clear format on selected text only, whole block with the cursor only, links and ID tags kept, across blocks; links in the browser's own style |
| t18-example | The example document opens cleanly, uses every kind of content (including a checklist and a box of each type) and saves back unchanged |
| t19-repeat | Repeat last toolbar command by key, by Option or Alt + click and by the button; set not toggle; kept through typing; table commands; nothing outside a table; undo; links under Alt + click |
| t20-checklist | Checklists: made from paragraphs, bullets and numbers; Enter, Backspace; ticked by a click, undo; saved and re-opened; the saved file with scripts off; table cells; cleaning on open; copy and paste; repeat |
| t21-boxes | Boxes for the reader: the Box list inserts an empty box, typing and pasting into it, styles kept, the look, changing type, editable label, Enter in and out, Remove box, undo, no box in a box, save and re-open, copy and paste, repeat |
| t22-table-headers | Header and sub header rows and columns: the four buttons, on and off, switching, the top row, selections, scope for screen readers, the look, undo, new rows and columns, merged cells, save and re-open, repeat, fancy tables |
| t23-column-widths | Dragging a column border: width moves between the two columns, the table keeps its width, a minimum width, outer edges, undo, save and re-open, added and deleted columns, double-click for automatic widths, fancy tables |
| t24-cell-select | Selecting cells by Shift+click and by dragging: column, row and rectangle; Bold, Italic and Clear format on the block; header and merge buttons; copy as a table and as text; cut, Delete, undo; ending the selection; text selection inside one cell; nothing saved |
| t25-compact-list | Compact list on and off for bulleted and numbered lists, checklists and lists in tables; inner lists; other lists untouched; undo; save and re-open; repeat |
| t26-inspector | Inspect formatting: opens only on demand, lists formats from the outside in, the look line, marks what the toolbar cannot make, blocks, boxes, lists and table cells, removing one format, a selected word, closing, nothing saved |
| t27-more-formats | Superscript, subscript, strike-through and inline code from the More list: on, off, ticks, undo, repeat, limits, Clear format, pasted strike-through kept, toolbar on one row |
| t28-list-indent | List indent and outdent by button and by Tab: levels, several items, cursor kept, top level becomes a paragraph, numbered lists and checklists, Q&A untouched, lists in table cells |
| t29-qa-lists | Lists inside a Q&A answer: made from the current line or the selected lines, kinds and changing kind, Enter and Backspace, leaving the list, indent, the Q&A stays whole, questions refuse lists, saved markup |
| t30-paste-bold | Bold is a set 700; bold pasted from other programs is dropped in header cells, headings, Q&A questions and box labels, collapsed when nested, kept elsewhere; bold copied in the editor is kept |
| t31-list-start | Start numbering at: the button, the suggested number, typed numbers, Back to 1, inner lists and lists in tables, undo, save and re-open, paste, repeat, Inspect formatting |
| t32-breaks-tags-joins | Line breaks beside ID tags, Enter after a tag, the ID tag button in list items and cells, tags kept when blocks are joined, blocks with line breaks made into list items and back, Enter before a line break |
| t33-clear-keeps-selection | Clear format keeps the selection: whole blocks, several blocks, part of a block, list items, table cells; a style, list or bold applied next; undo |
| t34-insert-at-cursor | Inserts go where the cursor is: code block, table, box in an empty paragraph, at the start, end and middle of a paragraph, headings, the title, lists; the Q&A button on empty and filled paragraphs, several paragraphs, toggling off, lists and cells, boxes, undo, repeat |
| t35-outputs | The two built files: the editor has no notebook code, the notebook has all of it, each has its own tab title and draft key, both write the same page format, neither loads from the network |
| t36-ascii-save | Saved pages are plain ASCII: other characters become HTML codes by name or number, in the text, title, index and link addresses; the page re-opens exactly as it was and saves the same again |
| nb1-notebook | Notebook explorer on an in-memory folder (`test/mockfs.mjs`): the tab and panel, landing, tree order, hidden files and settings, opening pages, the Save, Discard, Cancel prompt, first save named from the H1, name clashes, rename, new folder, move by drag, trash and restore, changes made outside the editor, import of other HTML, Markdown and plain text, copy where the browser cannot move, read-only mode, the notice for browsers without folder access |
| nb2-history | Notebook history: no copy when nothing changed, copies of unsaved work, the replaced version kept on save, no duplicates, Page history and Restore, recovery of unsaved work, history following rename and move, status line and thresholds, clean-up of history and trash, none of it in read-only mode |

## Updating the diagram editor

Build myDiagramer, copy its `diagram-editor.html` into `vendor/`, then `npm run build` and `npm test`. The document editor relies only on the embed messages in myDiagramer's `docs/EMBED.md`: `de:ready`, `de:init`, `de:save`, `de:cancel`, `de:dirty`.

## Credits

The editor is built with these open-source components. Their copyright notices and licence texts are in [THIRD-PARTY-NOTICES.md](THIRD-PARTY-NOTICES.md).

| Component | Used for | Licence |
|---|---|---|
| [Phosphor Icons](https://phosphoricons.com) | Toolbar, Help, box and note icons | MIT |
| [Instrument Sans](https://github.com/Instrument/instrument-sans) | Body text | SIL Open Font License 1.1 |
| [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono) | Code blocks and ID tags | SIL Open Font License 1.1 |
| Architects Daughter, Kimberly Geswein | Title and headings | SIL Open Font License 1.1 |
| [Rough.js](https://roughjs.com) | Hand-drawn rendering in the diagram editor | MIT |
| [mxGraph](https://github.com/jgraph/mxgraph) line routing (ported) | Line routing in the diagram editor | Apache License 2.0 |

The fonts are packaged by [Fontsource](https://fontsource.org).
