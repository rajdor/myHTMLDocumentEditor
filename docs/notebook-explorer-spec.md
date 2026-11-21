# Notebook explorer: specification

## Purpose

Add a file explorer panel to the Fine Line document editor so that a folder on disk works as a notebook: folders are sections, files are pages. The editor remains one self-contained, offline HTML file.

## Scope

- Chrome and Edge only. In other browsers the panel is not offered and the editor works as it does today.
- Single-file mode is unchanged and remains the default. The panel is hidden until a notebook is opened.

## Notebook structure

| Path | Purpose | Shown in tree |
|---|---|---|
| `.notebook/settings.json` | Favourites, sort choices, view state, history thresholds | As a hidden file |
| `.trash/` | Deleted pages and folders, mirroring their original paths | Pinned to the bottom, collapsed |
| `.history/` | Snapshots, mirroring page paths | Pinned to the bottom, collapsed |
| `_templates/` | Page templates | Pinned to the bottom, collapsed |

Special folders are created on first use. They stay reachable when hidden files are switched off. Missing or damaged settings fall back to defaults.

## Explorer panel

- Shown from a tab at the left edge of the window; hidden from the arrows at the top of the panel; resizable; state is remembered.
- A tree of unlimited depth. Folders load when expanded.
- All files are listed. Pages the editor can open are normal; all others are greyed.
- Hidden (dot) files are shown, with a show or hide option.
- Each row has a tooltip with its path within the notebook.
- Favourites are pages, not folders. They are listed in a block at the top, which can be folded away. A star on each page row adds or removes it. A favourite follows its page when it is renamed or moved in the editor and is dropped when the page goes to the trash. One whose page has gone outside the editor stays listed, greyed.
- Sort by name, modified date, size or type, ascending or descending, from a button at the top of the panel. Folders always come first. One setting for the whole notebook, with an optional override per folder from the folder's right-click menu. Setting the notebook sort clears every folder override.
- A refresh button. The tree also rescans when the window regains focus.
- A landing screen explains the folder pick. The folder is remembered and reconfirmed with one click per session. A clear screen is shown when access is refused.

## Pages

- A new page is created in the selected folder and exists in memory until first saved.
- At first save the file name is taken from the first H1. After that, the name changes only by explicit rename.
- Saving is explicit. If a file of that name already exists at first save, the user is prompted.
- Rename is checked when Enter is pressed, not while typing. A rename that would clash is refused. Names are compared ignoring case.
- Links between pages are relative paths. They are not rewritten when a page is renamed or moved.
- Pasted images are embedded inside the page.

## Switching pages

If the current page has unsaved changes, a prompt offers: Save and switch, Discard and switch, Cancel.

## Opening other files

| File | Behaviour |
|---|---|
| Page made by the editor | Opens for editing |
| Other HTML | Best-effort import through the existing cleaning |
| Markdown (`.md`, `.markdown`) | Opens in the WYSIWYG editor with the Markdown profile; saved back as Markdown, in place. Right-click offers Open as text |
| Plain text, data and code (JSON, XML, CSS, JavaScript, TypeScript, Python, SQL, YAML, shell, PowerShell, batch, TOML, ini, plain text) | Opens in the text editor; saved in place, in its own encoding and with its own line endings |
| Anything else | Greyed; right-click offers Open in new browser tab |

## Editors

The notebook is the host: it lists the files, chooses the editor by the file's name, and does the reading, writing, history, trash and prompts for every kind of file. An editor is a module in `src/editors/`, and `build.js` names the editors each program carries. The document editor on its own carries none and opens Fine Line pages only.

| Editor | Files | Saved as |
|---|---|---|
| Page | Pages made by the editor (`.html`) | A Fine Line page |
| Markdown | `.md`, `.markdown` | Markdown. The page editor with a profile: commands for things Markdown cannot hold are switched off |
| Text | Plain text, data and code | The same file: same encoding (UTF-8, with or without a byte order mark, or UTF-16), same line endings |

- A Markdown file is shown plain, in the system fonts, with none of the page look. The Source button switches it between the formatted view and its source in the text editor, carrying unsaved changes; unchanged, the source is the file as it is on disk.
- The tree shows every file by its full name, extension included.
- A Markdown file keeps its front matter, bullet and emphasis characters, code languages and heading levels 5 and 6. Line wrapping inside a paragraph, reference-style links and HTML written in the file are not kept; the file is otherwise rewritten in one style.
- If a Markdown file holds something Markdown cannot keep (a pasted box or diagram, HTML in the file), this is named before the save, once for each time the file is opened.
- A file that is not UTF-8 or UTF-16 text is shown read-only by the text editor.
- The text editor is CodeMirror 6. It is carried inside the notebook as text and started the first time a text file is opened.
- History, the unsaved-changes prompt, rename, move and trash work for every kind of file the notebook edits. A history copy keeps the extension of its file.
- New pages are Fine Line pages. New Markdown and text files are made outside the notebook.

## Tree operations

New page, new page from template, new folder, rename, move by drag, delete, add or remove favourite, open in new browser tab. Available from a right-click menu.

## Trash

- Delete moves the item to `.trash/`, keeping its original path.
- Restore by command or by dragging out of trash.
- Empty trash is a manual, confirmed action.

## History

- A full self-contained copy is written to `.history/<page path>/`: the version being replaced, on every save over an earlier version; and the unsaved work, every 5 minutes while the page has changed since the last copy. Nothing is written when nothing has changed.
- There is no automatic limit.
- Moving or renaming a page inside the editor moves its history with it.
- A Page history list shows a page's snapshots, with open and restore.
- Opening a page whose newest copy is unsaved work newer than the file offers to recover it.

## Status bar

A line at the foot of the explorer shows the total size of history and trash with a status icon, and opens the clean-up dialog. Thresholds are held in settings.

| Status | Default range |
|---|---|
| OK (grey) | Under 50 MB |
| Note | 50 to 100 MB |
| Warning | Over 100 MB |

## Clean-up

One dialog for history and trash.

- Analyse: size and snapshot count per page, oldest snapshot, history whose page no longer exists.
- Clean up: keep the last N snapshots per page, delete snapshots older than a chosen number of days, remove orphaned history, empty trash.
- Every delete lists what it will remove and asks for confirmation.

## Search

- Typing filters page names immediately.
- Enter runs a full text search and lists results with snippets.
- Trash, history and templates are excluded.

## Templates

- Any page in `_templates/` is offered by New page from template.
- The new page takes the template's content. A date placeholder in the template is replaced with the current date.

## Other additions

- Insert date and time button.
- Back and forward between pages, and a recent pages list.
- The last open page and tree state are restored on start.

## Reliability

- All writes (saves, snapshots, settings) go through one queue, with retry and read-back.
- Before saving, the file's modified time is checked. If it changed on disk, the user is asked before overwriting.

## Build order

1. Spike: folder permission on reopen from a `file://` page; reading sizes of cloud-only files.
2. Core: panel, tree, open, switch prompt, new, rename, move, trash.
3. History, status bar, clean-up dialog.
4. Favourites, sorting, search, templates.
5. Import, pasted images, remaining additions.

Existing tests continue to pass at every step. Each step adds its own tests.
