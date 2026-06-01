# Architecture

Folder Bases is a small Obsidian plugin. Its job: when a user clicks a folder in
the file explorer, open that folder's associated **Base** (`.base` file) instead
of (or in addition to) the default expand/collapse.

## Components

| File | Responsibility |
|------|----------------|
| `src/main.ts` | `FolderBasesPlugin` — lifecycle, click/middle-click interception, base resolution, open/create, commands, folder context menu. |
| `src/settings.ts` | `FolderBasesSettings` + `DEFAULT_SETTINGS`, the `renderTemplate` token helper, `paneArgForOpenLocation`, and `FolderBasesSettingTab` (the settings UI). |

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

A second capture-phase `auxclick` listener (`onAuxClick`) handles **middle-click**:
on the middle button over a folder whose base exists, it `preventDefault`s and
opens the base in a new tab (`openBase(base, "new-tab")`), ignoring the
configured open location. Both handlers share `folderFromTitleClick`, which
resolves the `.nav-folder-title` → enabled `TFolder` (or null for the chevron,
non-folders, and filtered-out folders).

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

- `openBase(file, location?)` opens the base according to `location` (defaulting
  to the `openLocation` setting). `paneArgForOpenLocation` (in `src/settings.ts`)
  maps the choice to a `getLeaf` argument: *current tab* → `false`, *new tab* →
  `"tab"`, *split right* → `"split"`. The *reuse* choice is handled first:
  `findLeafShowingFile` walks `iterateAllLeaves`, comparing each leaf's
  `getViewState().state.file` to the base path; a match is focused via
  `setActiveLeaf(..., { focus: true })` + `revealLeaf`, otherwise it falls back to
  a new tab. When a click opens an existing base, `onClick` also tags that title
  element with the `has-folder-base` CSS class (a styling hook).
- `createBaseFile(folder)` resolves the template via `resolveTemplate()`, renders
  its tokens, and writes the file with `app.vault.create` (no opening), returning
  the `TFile` or `null`. Failures are caught and surfaced via `Notice` +
  `console.error`.
- `createAndOpenBase(folder)` short-circuits to `openBase` if a base already
  exists, otherwise calls `createBaseFile`, shows a "Created base" `Notice`, and
  opens the result.
- `resolveTemplate()` picks the template string: when the **New base content
  from** setting is *Template file* and `templateFilePath(settings)` (a pure
  helper in `src/settings.ts`) yields a path that resolves to a `TFile`, it
  returns that file's `cachedRead` content; otherwise (inline source, empty path,
  or a missing file — the last with a `Notice`) it falls back to
  `defaultBaseTemplate` (a valid Bases YAML document; see `docs/bases-format.md`).

### Auto-create for new folders

When **Auto-create base for new folders** is on, a folder created in the vault
gets a base from the template automatically (without opening it).

- `installAutoCreate()` runs from `workspace.onLayoutReady` — *not* `onload` — so
  the `create` events Obsidian fires for existing folders during startup don't
  trigger a flood of auto-creations. It registers one `vault.on("create")`
  handler that queues `TFolder` creations via `queueAutoCreate`.
- Queueing collects folder paths into `pendingAutoCreate` and kicks the
  `autoCreateBases` debouncer (400 ms). The delay lets a folder created together
  with its notes (drag-drop, import, sync) settle so the note count is accurate
  rather than 0.
- `processPendingAutoCreate()` drains the set, re-resolving each path (a queued
  folder may have been deleted or moved) and calling `maybeAutoCreateBase`.
- `maybeAutoCreateBase(folder)` is the guard stack: setting on, `isFolderEnabled`,
  no existing base, and `noteCount(folder) >= autoCreateMinNotes` (immediate `.md`
  children). It then calls `createBaseFile` and shows a "Created folder base"
  `Notice`. Creating the base file emits a `create` event for a `TFile`, which the
  folder-only queue ignores (no recursion).

## Commands

`registerCommands` adds palette commands (no default hotkeys, per Obsidian
rules), each a `checkCallback` that only activates when applicable:

- **Open / Reveal / Open-in-default-app / Show-in-system-explorer** all target
  the active folder's existing base (`activeFolderBase()`), so they're hidden
  when no base exists. **Create** only needs an enabled folder.
- The two OS-level commands are registered only when `Platform.isDesktopApp`, and
  call `app.openWithDefaultApp` / `app.showInFolder` — runtime-only APIs typed via
  a local `declare module "obsidian"` augmentation in `main.ts`.
- `resolveActiveFolder()` is the "smart active folder" heuristic: if the focused
  leaf is the core `file-explorer` view, it reads the explorer's focused item
  (`view.tree.focusedItem.file`, typed via a minimal `FileExplorerView`
  interface); otherwise it uses the active note's parent folder, falling back to
  the vault root. Third-party explorers (e.g. Notebook Navigator) aren't
  `file-explorer`, so they fall through to the active-note branch.
- `revealInExplorer(file)` grabs the first `file-explorer` leaf's view and calls
  its `revealInFolder`, with a `Notice` fallback if unavailable.

## Settings

Stored via `loadData`/`saveData`. The settings tab exposes: filename template,
click trigger (plain vs modifier), modifier key (Ctrl/Cmd vs Alt/Option),
create-on-modifier-click toggle, **auto-create for new folders** (plus its
minimum-notes threshold), toggle-folder-on-open toggle, **open location**
(current tab / new tab / split right / reuse existing tab), the **folder base
indicator** style, the **hide base file** toggle, the **new base content source**
(inline YAML vs a referenced template file path), and the **folder filter** (mode
+ patterns + match-subfolders).

### Folder filter

`isFolderEnabled(folderPath, settings)` in `src/settings.ts` is the single
decision point, called as an early-return guard in both `onClick` and the
`file-menu` handler. It composes pure helpers — `parsePatterns` (split/trim/
normalize the pattern list), `globToRegExp` (compile a `*`/`**` glob to an
anchored regex), and `folderMatchesPatterns` (test the folder, plus its ancestor
chain when *match subfolders* is on). An empty pattern list is a safe no-op so a
misconfigured "Only these" can't disable every folder.

## Discoverability

A `file-menu` handler adds **Open folder base** (when a base exists) or **Create
folder base** (when it doesn't) to the right-click menu on folders.

### Persistent indicator

Folders that have a base are marked in the file explorer at all times. The single
source of truth is `markedFolders`, a `Set<string>` of folder paths that are both
*enabled* (`isFolderEnabled`) and have an existing base (`basePathForFolder`).

- `installIndicators()` runs from `workspace.onLayoutReady` (the vault and
  explorer DOM are ready by then). It does the initial `rebuildMarkedFolders()` +
  `applyIndicators()`, starts a `MutationObserver`, and registers the listeners.
- Two triggers, kept separate:
  - **Vault changed** — `vault.on("create" | "delete" | "rename")` →
    `refreshIndicators` (debounced) rebuilds the set, then re-marks.
  - **DOM re-rendered** — a `MutationObserver` on each explorer container
    (`childList` + `subtree`, *not* `attributes`, so our own class toggles can't
    feed back in) re-marks from the existing set as folders collapse/expand or
    scroll. `workspace.on("layout-change")` re-acquires/re-observes containers if
    the pane is reopened, moved, or popped out.
- `applyIndicators()` writes per explorer container: the
  `folder-bases-indicator-<style>` class (selecting the look), the
  `has-folder-base` class on each `.nav-folder-title[data-path]` whose path is in
  the set, and — when **Hide base file** is on — the `folder-bases-hidden` class
  (CSS `display:none`) on each `.nav-file-title[data-path]` whose path is in
  `baseFiles`. The `"none"` style clears the indicator classes. The look is
  realized entirely in `styles.css` (no per-element style assignment).
- The same rebuild that fills `markedFolders` also fills `baseFiles`, a
  `Set<string>` of those folders' own base paths, so hiding rides the same scan,
  `MutationObserver`, and vault/layout listeners — hidden bases stay hidden across
  collapse/expand/scroll. Only an enabled folder's own base is in the set, so the
  folder filter is respected.
- Cleanup is registered with `this.register(...)`: the observer is disconnected
  and the classes stripped on unload.

`basePathFor` (the pure path builder in `src/settings.ts`, also used by
`basePathForFolder`) is what makes the scan testable and keeps the template logic
in one place.

## Testing

The pure logic in `src/settings.ts` is unit-tested with Vitest in
`test/settings.test.ts` (`devbox run test`). Because that module imports
`"obsidian"`, `vitest.config.ts` aliases the import to `test/obsidian-mock.ts`, a
minimal stub exposing `normalizePath` and inert UI-class placeholders. Keeping the
matching/templating helpers pure and exported is what makes them testable without
the Obsidian runtime; the thin `main.ts` glue is exercised manually in the vault.
