# Roadmap

Planned features for Folder Bases, ranked by user value. Effort is a rough
T-shirt size (S / M / L). "Touches" lists the main files involved.

Status legend: 🔲 planned · 🚧 in progress · ✅ done

Shipped features and their release versions are recorded in
[`CHANGELOG.md`](CHANGELOG.md).

## Next 10 features

### 1. Persistent "has a base" indicator ✅
Show an indicator (icon/dot/style) on folders that have a base **at all times**,
not just after a click. Scan on load and react to vault create/delete/rename
events, marking `.nav-folder-title[data-path=...]`.
- **Why:** discoverability — the thing Folder Notes users rely on most.
- **Effort:** M · **Touches:** `main.ts`, `styles.css`
- **Shipped:** a `markedFolders` set (enabled folder + its base exists) drives a
  `has-folder-base` class on folder titles, rebuilt on vault create/delete/rename
  and re-applied via a `MutationObserver` on the explorer (so it survives
  collapse/expand/scroll). A **Folder base indicator** setting picks the style
  (none / italic / bold / accent / dot / icon), applied as a CSS class on the
  explorer container. See `installIndicators` / `applyIndicators` in `src/main.ts`.

### 2. Hide the base file in the explorer ✅
Optional toggle to hide a folder's own base file (e.g. `Books/Books.base`) from
the file explorer, like Folder Notes hides the folder note. CSS `display:none` on
the matching `.nav-file-title`.
- **Why:** a clean explorer is core to the folder-note UX.
- **Effort:** S–M · **Touches:** `main.ts`, `styles.css`, `settings.ts`
- **Shipped:** a **Hide base file in explorer** setting (off by default). The
  indicator scan now also collects each enabled folder's own base path into a
  `baseFiles` set; `applyIndicators` toggles a `folder-bases-hidden` class on the
  matching `.nav-file-title[data-path]` (CSS `display:none`), riding the same
  `MutationObserver` so hidden bases stay hidden across collapse/expand/scroll.
  Only an enabled folder's own base is hidden (respects the folder filter). See
  `applyIndicators` in `src/main.ts`.

### 3. Keep the base in sync on folder rename/move 🔲
On folder rename, the base filename (`OldName.base`) and its
`file.inFolder("OldName")` filter both go stale. Auto-rename the base file and
rewrite the filter via `vault.on("rename")` + `Vault.process()`.
- **Why:** prevents silent breakage — the biggest footgun of the same-name convention.
- **Effort:** M · **Touches:** `main.ts`

### 4. Commands with assignable hotkeys ✅
`addCommand` for: open base for the active folder, create base for the active
folder, reveal base file, plus desktop-only "open in default app" / "show in
system explorer". No default hotkeys (per Obsidian rules); users bind their own.
- **Why:** keyboard-driven workflows; also an accessibility win.
- **Effort:** S · **Touches:** `main.ts`
- **Shipped:** the "active folder" is resolved smartly — the file explorer's
  focused folder when the explorer is focused, otherwise the active note's
  parent folder — so a single command covers both the original "active folder"
  and "current note's folder" ideas. See `resolveActiveFolder` in `src/main.ts`.

### 5. Excluded / included folders ✅
Glob or path-prefix lists so certain folders (e.g. `Templates/`, `Archive/`)
never trigger base behavior.
- **Why:** avoids the plugin hijacking folders where it isn't wanted.
- **Effort:** M · **Touches:** `settings.ts`, `main.ts`
- **Shipped:** single **Folder filter** mode (All / Exclude / Only these) with a
  newline-separated pattern list, `*` glob support, and a *Match subfolders*
  toggle. See `isFolderEnabled` in `src/settings.ts`.

### 6. Open-location options ✅
Setting for how the base opens: current tab (default), new tab, split right, or
"reuse existing tab if already open." Middle-click → new tab.
- **Why:** always opening in the current leaf replaces whatever you were viewing.
- **Effort:** S · **Touches:** `main.ts`, `settings.ts`
- **Shipped:** an **Open base in** setting (current tab / new tab / split right /
  reuse existing tab) applied to every open path, plus middle-click → new tab.
  See `openLocation` / `paneArgForOpenLocation` in `src/settings.ts`.

### 7. Auto-create a base for newly created folders ✅
Optional: when a new folder is created, generate its base from the template
automatically. Pair with an "only for folders with ≥N notes" guard to avoid noise.
- **Why:** zero-friction adoption; every folder becomes a dashboard.
- **Effort:** S–M · **Touches:** `main.ts`, `settings.ts`
- **Shipped:** an **Auto-create base for new folders** toggle (off by default)
  plus a **Minimum notes to auto-create** threshold. A `vault.on("create")`
  handler registered from `onLayoutReady` (so startup's create flood is ignored)
  queues new folders into a debounced `processPendingAutoCreate` — the 400 ms
  delay lets a folder created alongside its notes settle before the note count is
  checked. `maybeAutoCreateBase` guards on the setting, the folder filter, no
  existing base, and `noteCount >= autoCreateMinNotes`, then writes the base via
  the shared `createBaseFile` without opening it. See `src/main.ts`.

### 8. Template file reference ✅
Let the default content point to a template `.base` (or per-folder-type
templates) instead of one inline YAML string.
- **Why:** scales beyond a single global template.
- **Effort:** M · **Touches:** `settings.ts`, `main.ts`
- **Shipped:** a **New base content from** setting (inline / template file). In
  *Template file* mode, `resolveTemplate()` reads the configured `.base` file's
  content (token-substituted like the inline default) and falls back to the
  inline content with a `Notice` if the file is missing. The source decision is a
  pure, unit-tested `templateFilePath` helper in `src/settings.ts`. Per-folder-
  type templates remain future work (overlaps with #10's per-folder override).

### 9. Graceful handling when Bases is unavailable ✅
Detect that the `bases` core plugin is enabled and the app meets `minAppVersion`;
if not, show a clear one-time `Notice` instead of opening a file that won't render.
- **Why:** turns a confusing dead-end into an actionable message.
- **Effort:** S · **Touches:** `main.ts`
- **Shipped:** `basesAvailable()` checks the core `bases` internal plugin via
  `app.internalPlugins`. `ensureBasesAvailable()` guards the open/create paths
  (`openBase`, `createAndOpenBase`), showing a one-time "Enable it in Settings →
  Core plugins" `Notice` and aborting; the flag resets once Bases is enabled so
  the warning can fire again later. Auto-create skips silently. `minAppVersion`
  isn't re-checked in code — Obsidian already refuses to load the plugin below
  it. See `src/main.ts`.

### 10. Per-folder override of which base to open 🔲
Allow a folder to point at a non-default base (e.g. context menu → "Set as folder
base"), for when the base lives elsewhere or has a custom name.
- **Why:** flexibility for users who don't want the same-name convention everywhere.
- **Effort:** M–L · **Touches:** `main.ts`, `settings.ts`, persisted data

### 11. Better auto-MOC base 🔲
The default base should serve as an automated MOC. Namely, it should display nested
content and nested Folder Bases in a useful way.
- **Why:** turns every folder base into a navigable map of content, not just a flat table.
- **Effort:** M · **Touches:** `settings.ts` (default template), `main.ts`

## Suggested sequencing

1. **Quick, high-impact:** #1, #2, #4, #6 — most change the day-to-day feel; mostly small.
2. **Robustness:** #3, #9 — prevent broken/stale states.
3. **Power / flexibility:** #5, #7, #8, #10.

> Note: #3 (rename sync) and #10 (per-folder override) share persisted state —
> design their data model together if both are planned.

## Backlog / nice-to-have

- Notebook Navigator explorer support for the active-folder commands (its view
  isn't `file-explorer`, so `resolveActiveFolder` currently ignores its
  selection and falls back to the active note's folder).
- Ribbon icon for quick access.
- Localization / i18n.
- Mobile tap-target tuning.
- "Create a base from the currently selected notes."
- Broaden test coverage to `src/main.ts` behaviors (base-path resolution, the
  click/menu guards) once that logic is factored to be testable without the
  Obsidian runtime.

## Done

- ✅ Persistent indicator on folders that have a base, with a configurable style
  (none / italic / bold / accent / dot / icon) (#1).
- ✅ Hide a folder's own base file in the file explorer, via an optional toggle (#2).
- ✅ Click a folder to open its base (plain or modifier + click, configurable).
- ✅ Configurable filename template (`{{folder_name}}` / `{{folder_path}}`).
- ✅ Auto-create a base from a template on modifier + click.
- ✅ Folder right-click menu: open / create folder base.
- ✅ Default template excludes the folder's own `.base` (notes only via `file.ext == "md"`).
- ✅ Exclude / include folder filter with glob patterns and subfolder matching (#5).
- ✅ Commands (open / create / reveal / open-in-default-app / show-in-system) with
  user-assignable hotkeys and smart active-folder resolution (#4).
- ✅ Open-location options (current tab / new tab / split right / reuse existing
  tab) plus middle-click → new tab (#6).
- ✅ Template file reference: generate new bases from a referenced `.base`
  template file (token-substituted) instead of only the inline content (#8).
- ✅ Auto-create a base for newly created folders, with an optional minimum-notes
  threshold to avoid noise (#7).
- ✅ Graceful one-time `Notice` when the core Bases plugin is disabled, instead of
  opening a base that won't render (#9).
- ✅ Vitest unit-test harness covering the pure settings logic (`test/`, `devbox run test`).
