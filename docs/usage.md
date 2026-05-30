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
| **Default base content** | YAML written into newly created `.base` files. Tokens: `{{folder_name}}`, `{{folder_path}}`. |
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

## Right-click menu

Right-clicking a folder shows **Open folder base** (if one exists) or **Create
folder base** (if it doesn't).

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
