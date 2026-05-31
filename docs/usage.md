# Usage

Folder Bases lets you open an Obsidian **Base** by clicking a folder in the file
explorer — like the *Folder Notes* plugin, but for `.base` files.

## Install (from source)

This repo lives inside the demo vault at
`.obsidian/plugins/folder-bases/`, so no copying is needed.

1. Build it: `devbox run build` (or `devbox run dev` to rebuild on save).
2. In Obsidian: **Settings → Community plugins → enable "Folder Bases"**.
   (If it was already enabled, toggle it off and on to reload after a rebuild.)

To install into another vault, copy `manifest.json`, `main.js`, and `styles.css`
into `<vault>/.obsidian/plugins/folder-bases/`.

## How it works

Each folder can have an associated base file. By default that's a `.base` file
**inside** the folder with the **same name** as the folder:

```
Projects/
  Projects.base      <- opened when you click the "Projects" folder
  Note A.md
  Note B.md
```

The filename is configurable (see Settings).

## Settings

| Setting | What it does |
|---------|--------------|
| **Base filename template** | Path of a folder's base, relative to the folder. Tokens: `{{folder_name}}`, `{{folder_path}}`. Default `{{folder_name}}.base`. Examples: `_index.base`, `{{folder_name}}.base`. |
| **Click trigger** | *Plain click* opens the base on a normal click. *Modifier + click* requires holding the modifier key (normal click still expands/collapses). |
| **Modifier key** | Ctrl/Cmd or Alt/Option. Used both for the modifier trigger and for creating a base on click. |
| **Create base on modifier + click** | When a folder has no base, a modifier + click creates one from the default template and opens it. |
| **Toggle folder when opening** | When a plain click opens a base, also expand/collapse the folder as usual. Off by default (folder stays put). |
| **Open base in** | Where a base opens: *Current tab* (default), *New tab*, *Split right*, or *Reuse existing tab* (focuses an already-open tab if there is one). Applies to clicks, commands, and the right-click menu. Middle-clicking a folder always opens in a new tab. |
| **Folder base indicator** | How folders that have a base are marked in the file explorer: *None*, *Italic* (default), *Bold*, *Accent color*, *Dot*, or *Icon*. The mark shows at all times — not just after you click — and respects the folder filter (excluded folders are never marked). |
| **New base content from** | Where a newly created base gets its content: *Inline content* (the YAML in **Default base content**, the default) or *Template file* (a `.base` file in your vault). |
| **Template file** | Vault-relative path to the `.base` template (shown when the source is *Template file*). Tokens `{{folder_name}}`, `{{folder_path}}` are still substituted; if the file is missing, the inline content is used instead. |
| **Default base content** | YAML written into newly created `.base` files (shown when the source is *Inline content*). Tokens: `{{folder_name}}`, `{{folder_path}}`. |
| **Folder filter** | Which folders respond to clicks: *All folders* (default), *Exclude these folders*, or *Only these folders*. |
| **Folder patterns** | One folder path per line (shown when the filter isn't *All folders*). `*` is a wildcard, e.g. `*/drafts`. Matching is case-sensitive. |
| **Match subfolders** | When on, a pattern also matches folders nested inside it (e.g. `Archive` covers `Archive/2024`). |

The folder's collapse arrow (chevron) **always** expands/collapses, regardless of
settings — so you never lose normal folder navigation.

### Folder filter examples

- **Exclude these folders** with patterns `Templates` and `Archive` → those
  folders (and, with *Match subfolders* on, everything inside them) behave like
  normal folders; everywhere else opens bases as usual.
- **Only these folders** with pattern `Projects` → only `Projects` (and its
  subfolders) opens a base; all other folders are untouched.
- An empty pattern list is treated as "no filter" — every folder stays active, so
  you can't accidentally lock yourself out.

### Template files

By default, new bases are created from the inline **Default base content** YAML.
If you'd rather keep your template as a real file — to edit it with Bases' own
editor, or to reuse it across vaults — set **New base content from** to *Template
file* and point **Template file** at a `.base` file (e.g. `Templates/Folder.base`).

When a base is created, that file's content is read and the same
`{{folder_name}}` / `{{folder_path}}` tokens are substituted. If the file can't be
found, the plugin falls back to the inline content (and shows a notice), so a
typo in the path never blocks creation.

> Tip: the template file itself contains `{{...}}` tokens, which aren't valid
> Bases filter syntax, so it won't render as a normal base. Keep it somewhere out
> of the way (e.g. a `Templates/` folder you've added to the folder filter's
> *Exclude* list).

## Right-click menu

Right-clicking a folder shows **Open folder base** (if one exists) or **Create
folder base** (if it doesn't).

## Commands & hotkeys

The plugin registers commands you can run from the command palette or bind to
your own hotkeys (**Settings → Hotkeys**; none are bound by default, per
Obsidian's guidelines):

| Command | What it does |
|---------|--------------|
| **Open base for the active folder** | Opens the base for the *active folder* (see below). Only available when that base exists. |
| **Create base for the active folder** | Creates a base for the active folder from the template and opens it. |
| **Reveal base file in file explorer** | Scrolls to and highlights the active folder's base in the file explorer. |
| **Open base file in default app** | *(Desktop only)* Opens the base with your OS's default app for `.base` files. |
| **Show base file in system explorer** | *(Desktop only)* Reveals the base in your OS file manager. |

The **active folder** is resolved smartly: if the file explorer pane is focused,
its selected folder is used; otherwise the parent folder of the currently open
note is used. So whether you're navigating files or editing a note, the commands
target the folder you'd expect.

## Quick test (in the demo vault)

1. Create a folder, e.g. `Projects/`, with a couple of notes inside.
2. **Auto-create**: hold your modifier (default Ctrl/Cmd) and click the
   `Projects` folder title → a `Projects/Projects.base` is created and opens,
   showing the folder's notes in a table.
3. Click elsewhere, then click the `Projects` folder again (plain click, default
   trigger) → the same base reopens. The chevron still toggles the folder.
4. Switch **Click trigger** to *Modifier + click* and confirm a plain click only
   expands/collapses while modifier + click opens the base.
5. Change **Base filename template** to `_index.base` and confirm new folders
   resolve to `<folder>/_index.base`.
6. **Indicator**: confirm `Projects` now shows the folder-base mark (italic by
   default) without clicking it. Collapse and expand its parent — the mark
   persists. Try other **Folder base indicator** styles, then delete the base and
   confirm the mark disappears.
