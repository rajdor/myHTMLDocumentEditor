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

- Show and hide from the toolbar; resizable; state is remembered.
- A tree of unlimited depth. Folders load when expanded.
- All files are listed. Pages the editor can open are normal; all others are greyed.
- Hidden (dot) files are shown, with a show or hide option.
- Each row has a tooltip with its path within the notebook.
- Favourites are listed at the top.
- Sort by name, modified date, size or type. One setting for the whole notebook, with an optional override per folder.
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
| Markdown, plain text | Import; saved as a new HTML page, original untouched |
| Anything else | Greyed; right-click offers Open in new browser tab |

## Tree operations

New page, new page from template, new folder, rename, move by drag, delete, add or remove favourite, open in new browser tab. Available from a right-click menu.

## Trash

- Delete moves the item to `.trash/`, keeping its original path.
- Restore by command or by dragging out of trash.
- Empty trash is a manual, confirmed action.

## History

- A full self-contained snapshot is written to `.history/` every 5 minutes while the page has changed since the last snapshot, and on every save.
- There is no automatic limit.
- Moving or renaming a page inside the editor moves its history with it.
- A Page history list shows a page's snapshots, with open and restore.

## Status bar

Shows the total size of history with a status icon. Thresholds are held in settings.

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
