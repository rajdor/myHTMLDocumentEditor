# Changelog

## Unreleased
- More formats: a toolbar list with superscript, subscript, strike-through and inline code, each switched on or off for the selected text; the list ticks the ones on at the cursor. Inline code now uses the code font. Pasted strike-through is kept.
- List indent and outdent: two buttons, and Tab and Shift+Tab in a list. Outdent at the top level turns the item into a paragraph (a plain line in a table cell). Q&A lists are unchanged.
- Link button opens a form with display text and address in place of the single address prompt. The display text defaults to the selected text; the address defaults to the selected text when it is a web address, or to a web address on the clipboard when the browser already allows reading it (it never asks).
- Toolbar: narrower Style and Box lists and tighter group spacing so it stays on one row at 1440px.
- Inspect formatting: a toolbar button (magnifying glass) opens a popup listing the formatting on the text at the cursor or the selected word, from the outside in, with how it looks (font, size, weight, colour). Anything the toolbar cannot make there is marked, and one format can be removed at a time. It reads the document only when the button is pressed.
- Paste from other programs: a heading inside a table cell or list item becomes a bold line (a plain line in a header cell), because the toolbar has no headings there. Superscript, subscript and inline code are still kept.
- Clear format is thorough: in a table cell or list item that also holds a list or a heading it now clears the loose text too, a heading or paragraph inside a cell becomes a plain line instead of a paragraph, and strike-through, inserted and deleted text, keyboard and sample text are removed with the rest. Links and ID tags stay.
- Compact list: a button beside the list buttons puts less space between the lines of the list the cursor is in (bulleted, numbered or checklist, inner lists included).
- Selecting cells: Shift+click on another cell of the same table, or a drag from one cell into another, selects the block of cells between them (a column, a row or a rectangle). Bold, Italic, Clear format, the header and merge buttons, Delete, copy and cut act on the block; a copied block is a table, and tab-separated text. Escape, a click or typing ends it.
- Column widths: drag the border between two columns to move width from one to the other; the table keeps its own width. Widths are saved as percentages and follow added and deleted columns. A double-click on a border goes back to automatic widths.
- Table headers: four table buttons set a whole row or column as a header or a sub header, and the same button again makes it ordinary. Any row can change, the top one included. Header cells are marked as heading a row or a column for screen readers. A new row is ordinary apart from its header columns, and a new column is ordinary apart from its header rows.
- Diagram editor updated: the points shown by Edit points are the points a line can attach to, and other shapes stay connectable while one shape's points are edited; a label added to a line starts with a background in the canvas colour instead of transparent.
- Third-party notices: `THIRD-PARTY-NOTICES.md` carries the copyright notices and licence texts for Phosphor Icons, the three fonts, Rough.js and the mxGraph routing code; the README has a Credits section.
- Fonts: body text is Instrument Sans and code blocks and ID tags are JetBrains Mono (ligatures off). Both are embedded in the editor and in every saved document, so a document looks the same on any computer; this adds about 137 KB to each saved file. Headings keep Architects Daughter.
- Boxes for the reader: the Box list beside the Style list inserts a Note, Information, Tip, Warning or Critical box after the current block, ready to type or paste into. What goes in keeps its own style. The label starts as the type's name and can be retyped. With the cursor in a box the list changes its type. Enter on an empty last line leaves the box; Remove box keeps the content. These are separate from margin notes, which are for the author and reviewers.
- The example document has a checklist and one box of each type.
- Checklist: a Checklist button beside the list buttons makes a list with tick boxes. A click ticks a box and the tick is saved with the document. Saved documents need no script: the boxes are real checkboxes, so a reader can still tick them, though those ticks are not kept.
- Paste into a table cell or list item no longer leaves out text that sits beside a block (or in a plain box) in the copied content.
- A new list is no longer left inside the paragraph it was made from, and the cursor keeps its place when a list is made.
- Toolbar: the row, column, merge and compact buttons appear only while the cursor is in a table, to the right of the two insert buttons; the Table group is now last so nothing else moves. Margin notes have their own Notes group. The Diagram button uses the shapes icon. Show Index Levels is one button that steps through 1, 2 and 3, with the current level shown on it. Buttons are narrower so the toolbar stays on one row.

## 1.0.0
- First release.
