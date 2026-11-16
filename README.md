# Fine Line document editor

A single, offline HTML file for writing documents in the Fine Line Blueprint style: what you see while editing is what the saved document looks like. Diagrams are drawn in the built-in diagram editor (myDiagramer).

Open `fine-line-editor.html` in Chrome or Edge. Nothing is loaded from the network.

`candy-shop-sop.html` is an example document that uses every kind of content the editor makes. Open it in a browser to read it, or in the editor to change it.

## What it does

- Text: heading levels H1 (title) to H4, H1 and H2 subtitles, lead paragraph, caption, code blocks, bold, italic, lists, Q&A lists, links and ID tags. H2 headings are numbered.
- Clear format: removes bold and italics from the selected text; with the cursor only, or a whole block selected, the block also becomes a plain paragraph. Links and ID tags stay.
- Copy format: a format painter for block style, bold, italics and ID tags; one press applies once, a double-click keeps it on.
- Repeat last toolbar command: Option+Q on a Mac or Alt+Q on Windows applies the last toolbar command again at the cursor or on the selection; holding Option or Alt while you click or drag does the same in one move, and the Repeat button beside Redo names the command. It covers the Style list, bold, italic, lists, code block, ID tag, Note, Clear format and the table buttons, and it sets rather than toggles.
- Clipboard: copy, cut and paste keep formatting. Content copied in the editor pastes as it was; content from other programs keeps its structure and takes the document's style, through the same cleaning as Open.
- Tables: Table and Fancy Table (headings across the top, labels down the side, outlined). Add rows above or below and columns left or right, delete rows and columns, merge right, merge down, merge a selected block, split, compact. Enter, Tab and the arrow keys work cell by cell.
- Diagrams: Diagram opens the diagram editor in front of the document; Done places the diagram, Cancel discards changes. Double-click a diagram, or select it and press Enter, to edit it again.
- Notes: a margin with a bar and icon beside each noted block; the icon opens a dated log of initialled comments. The margin is hidden by default; the Notes margin button shows or hides it, and the choice is saved with the document. A clean copy without notes is offered after Save.
- Links: shown in the browser's own style (blue, underlined). Web images, video and audio become link cards, so nothing is downloaded on open. Ctrl or Cmd + click opens a link.
- Index: built from the headings, showing 1, 2 or 3 levels (H2 to H4). The setting is saved with the document; the default is 1.
- Files: Save writes one self-contained HTML document that opens in any browser and re-opens here. After a save, a line names the file saved; a dot on the Save button means there are unsaved changes. New and Open ask first when there are unsaved changes.
- Older formats: documents made with grids open as tables, and a diagram drawn directly on the page converts to a diagram-editor diagram when you double-click it.
- Toolbar: Phosphor icons grouped as File, History, Text, Lists, Insert, Table and Index, with the initials button and Help at the far right; hover for a description. Table buttons are dimmed outside a table.
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
| `fine-line-editor.html` | The built editor; this one file is all a user needs |
| `candy-shop-sop.html` | Example document: a standard operating procedure that uses every kind of content the editor makes |
| `src/index.html` | Page template: toolbar, help, overlay |
| `src/app.js` | Editor behaviour |
| `src/convert.js` | Converts diagrams drawn directly on the page (the older format) to draw.io for the diagram editor |
| `src/doc.css` | Document styles; these are written into every saved document |
| `src/editor.css` | Editing-only styles; never saved |
| `src/icons.json` | Phosphor state icons used in diagrams |
| `vendor/diagram-editor.html` | The built diagram editor from myDiagramer, embedded at build time |
| `build.js` | Builds `fine-line-editor.html` |
| `test/` | Regression tests; `test/files/legacy-document.html` is a small document in the older format used by t4 and t7 |
| `CHANGELOG.md` | What changed in each version |

## Build and test

```
npm install
npm run build
npm test
```

Tests use puppeteer-core with a local Chrome or Edge (or `CHROME_PATH`). `npm test` runs every `test/t*.mjs`; `node test/run-all.mjs t6` runs one. Each test prints one line per check, and the full output goes to `test/out/results.txt`.

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
| t12-links | Nothing downloaded on open, web media become link cards, saved links, click and hover, Link button add, edit, refuse, remove |
| t13-notes | Notes on blocks, tables and diagrams; margin hidden by default, shown by the button or by adding a note, saved with the document; icon opens the log without moving the page; date and initialled lines; growing; Enter in and out; removal when empty; closed on open, not saved open; clean copy offer and the saved line; undo; earlier note form upgraded; print |
| t14-clipboard | Copy, cut and paste keep formatting: inline, blocks, lists, tables, cells; notes left behind; undo; cleaning of HTML from other programs |
| t15-new-help | New asks before discarding unsaved changes (new and opened documents, every kind of change); Help dialog at the far right with the editor version and document name; the cursor stays in the document after a toolbar list is used; initials button |
| t16-copy-format | Copy format: block style by a click, inline formatting onto a selection, list items and cells, code, links, several blocks, once or kept on, undo |
| t17-clear-format | Clear format on selected text only, whole block with the cursor only, links and ID tags kept, across blocks; links in the browser's own style |
| t18-example | The example document opens cleanly, uses every kind of content and saves back unchanged |
| t19-repeat | Repeat last toolbar command by key, by Option or Alt + click and by the button; set not toggle; kept through typing; table commands; nothing outside a table; undo; links under Alt + click |

## Updating the diagram editor

Build myDiagramer, copy its `diagram-editor.html` into `vendor/`, then `npm run build` and `npm test`. The document editor relies only on the embed messages in myDiagramer's `docs/EMBED.md`: `de:ready`, `de:init`, `de:save`, `de:cancel`, `de:dirty`.
