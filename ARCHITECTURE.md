# Architecture

Folder Bases is a small Obsidian plugin. Its job: when a user clicks a folder in
the file explorer, open that folder's associated **Base** (`.base` file) instead
of (or in addition to) the default expand/collapse.

## Components

| File | Responsibility |
|------|----------------|
| `src/main.ts` | `FolderBasesPlugin` — lifecycle, click interception, base resolution, open/create, folder context menu. |
| `src/settings.ts` | `FolderBasesSettings` + `DEFAULT_SETTINGS`, the `renderTemplate` token helper, and `FolderBasesSettingTab` (the settings UI). |

There is **no custom Obsidian view**. Obsidian's core *Bases* plugin already
registers the `.base` file extension and its view. Opening a `.base` `TFile`
through the normal workspace API renders the Bases view automatically.

## Click interception

```
document click (capture phase)
  └─ onClick(evt)
       ├─ ignore clicks on .nav-folder-collapse-indicator (chevron always toggles)
       ├─ find closest .nav-folder-title; read data-path -> folder path
       ├─ resolve TFolder
       ├─ trigger satisfied?  (plain-click mode: always; modifier mode: modifier held)
       ├─ basePath = folderPath + render(baseNameTemplate)
       └─ resolve basePath:
            ├─ TFile exists       -> preventDefault (unless collapseOnOpen) + openBase
            ├─ missing + modifier + createOnModifierClick -> create + openBase
            └─ otherwise          -> do nothing (folder toggles normally)
```

Key choices:

- **Capture phase** (`registerDomEvent(document, "click", handler, { capture: true })`):
  the listener fires before the file explorer's own bubble-phase handler, so a
  `stopPropagation()` prevents the default folder collapse/expand.
- **Surgical `preventDefault`**: the default is only suppressed when we actually
  open or create a base. Clicks on the chevron, on folders without a base, or in
  modifier-mode without the modifier all fall through to normal behavior.
- **`registerDomEvent` / `registerEvent`**: both auto-unregister on plugin
  unload, so there is no manual teardown in `onunload`.

## Base resolution

`basePathForFolder(folder)`:

1. `render(baseNameTemplate, folder_name, folder_path)` — replaces
   `{{folder_name}}` and `{{folder_path}}` tokens (default template
   `{{folder_name}}.base`).
2. Join with the folder path (`folder.path ? folder.path + "/" + rendered : rendered`).
3. `normalizePath(...)`.

So folder `Projects` with the default template resolves to
`Projects/Projects.base`.

## Open / create

- `openBase(file)` → `app.workspace.getLeaf(false).openFile(file)`. When a click
  opens an existing base, `onClick` also tags that title element with the
  `has-folder-base` CSS class (a styling hook).
- `createAndOpenBase(folder)` → renders `defaultBaseTemplate` (a valid Bases YAML
  document; see `docs/bases-format.md`), writes it with `app.vault.create`, shows
  a `Notice`, and opens it. Failures are caught and surfaced via `Notice` +
  `console.error`.

## Settings

Stored via `loadData`/`saveData`. The settings tab exposes: filename template,
click trigger (plain vs modifier), modifier key (Ctrl/Cmd vs Alt/Option),
create-on-modifier-click toggle, toggle-folder-on-open toggle, and the default
base YAML.

## Discoverability

A `file-menu` handler adds **Open folder base** (when a base exists) or **Create
folder base** (when it doesn't) to the right-click menu on folders.
