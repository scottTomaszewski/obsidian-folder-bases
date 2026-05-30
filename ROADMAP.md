# Roadmap

Planned features for Folder Bases, ranked by user value. Effort is a rough
T-shirt size (S / M / L). "Touches" lists the main files involved.

Status legend: 🔲 planned · 🚧 in progress · ✅ done

## Next 10 features

### 1. Persistent "has a base" indicator 🔲
Show an indicator (icon/dot/style) on folders that have a base **at all times**,
not just after a click. Scan on load and react to vault create/delete/rename
events, marking `.nav-folder-title[data-path=...]`.
- **Why:** discoverability — the thing Folder Notes users rely on most.
- **Effort:** M · **Touches:** `main.ts`, `styles.css`

### 2. Hide the base file in the explorer 🔲
Optional toggle to hide a folder's own base file (e.g. `Books/Books.base`) from
the file explorer, like Folder Notes hides the folder note. CSS `display:none` on
the matching `.nav-file-title`.
- **Why:** a clean explorer is core to the folder-note UX.
- **Effort:** S–M · **Touches:** `main.ts`, `styles.css`, `settings.ts`

### 3. Keep the base in sync on folder rename/move 🔲
On folder rename, the base filename (`OldName.base`) and its
`file.inFolder("OldName")` filter both go stale. Auto-rename the base file and
rewrite the filter via `vault.on("rename")` + `Vault.process()`.
- **Why:** prevents silent breakage — the biggest footgun of the same-name convention.
- **Effort:** M · **Touches:** `main.ts`

### 4. Commands with assignable hotkeys 🔲
`addCommand` for: open base for the active folder, open base for the folder of
the current note, create base for the active folder, reveal base file. No default
hotkeys (per Obsidian rules); users bind their own.
- **Why:** keyboard-driven workflows; also an accessibility win.
- **Effort:** S · **Touches:** `main.ts`

### 5. Excluded / included folders ✅
Glob or path-prefix lists so certain folders (e.g. `Templates/`, `Archive/`)
never trigger base behavior.
- **Why:** avoids the plugin hijacking folders where it isn't wanted.
- **Effort:** M · **Touches:** `settings.ts`, `main.ts`
- **Shipped:** single **Folder filter** mode (All / Exclude / Only these) with a
  newline-separated pattern list, `*` glob support, and a *Match subfolders*
  toggle. See `isFolderEnabled` in `src/settings.ts`.

### 6. Open-location options 🔲
Setting for how the base opens: current tab (today), new tab, split right, or
"focus existing tab if already open." Support middle-click → new tab.
- **Why:** always opening in the current leaf replaces whatever you were viewing.
- **Effort:** S · **Touches:** `main.ts`

### 7. Auto-create a base for newly created folders 🔲
Optional: when a new folder is created, generate its base from the template
automatically. Pair with an "only for folders with ≥N notes" guard to avoid noise.
- **Why:** zero-friction adoption; every folder becomes a dashboard.
- **Effort:** S–M · **Touches:** `main.ts`, `settings.ts`

### 8. Template file reference 🔲
Let the default content point to a template `.base` (or per-folder-type
templates) instead of one inline YAML string.
- **Why:** scales beyond a single global template.
- **Effort:** M · **Touches:** `settings.ts`, `main.ts`

### 9. Graceful handling when Bases is unavailable 🔲
Detect that the `bases` core plugin is enabled and the app meets `minAppVersion`;
if not, show a clear one-time `Notice` instead of opening a file that won't render.
- **Why:** turns a confusing dead-end into an actionable message.
- **Effort:** S · **Touches:** `main.ts`

### 10. Per-folder override of which base to open 🔲
Allow a folder to point at a non-default base (e.g. context menu → "Set as folder
base"), for when the base lives elsewhere or has a custom name.
- **Why:** flexibility for users who don't want the same-name convention everywhere.
- **Effort:** M–L · **Touches:** `main.ts`, `settings.ts`, persisted data

## Suggested sequencing

1. **Quick, high-impact:** #1, #2, #4, #6 — most change the day-to-day feel; mostly small.
2. **Robustness:** #3, #9 — prevent broken/stale states.
3. **Power / flexibility:** #5, #7, #8, #10.

> Note: #3 (rename sync) and #10 (per-folder override) share persisted state —
> design their data model together if both are planned.

## Backlog / nice-to-have

- Ribbon icon for quick access.
- Localization / i18n.
- Mobile tap-target tuning.
- "Create a base from the currently selected notes."

## Done

- ✅ Click a folder to open its base (plain or modifier + click, configurable).
- ✅ Configurable filename template (`{{folder_name}}` / `{{folder_path}}`).
- ✅ Auto-create a base from a template on modifier + click.
- ✅ Folder right-click menu: open / create folder base.
- ✅ Default template excludes the folder's own `.base` (notes only via `file.ext == "md"`).
- ✅ Exclude / include folder filter with glob patterns and subfolder matching (#5).
