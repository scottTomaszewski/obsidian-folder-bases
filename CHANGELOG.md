# Changelog

All notable changes to Folder Bases are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html)
(`MAJOR.MINOR.PATCH` — incompatible change / new feature / bug fix).

Unreleased changes accumulate under **Unreleased**; cutting a release
(`devbox run release <version>`) renames that section to the new version header.

## 1.9.0

### Changed
- **Narrower vault access**: folder indicators are now rebuilt by iterating only
  the vault's folders (`vault.getAllFolders`) instead of enumerating every file
  in the vault, so the plugin no longer touches file-level paths it doesn't need.

## 1.8.0

### Changed
- **Default base is now an auto-MOC**: newly created bases group their notes by
  subfolder (`groupBy: file.folder`) instead of showing one flat table. Combined
  with `file.inFolder` being recursive, a folder's base now reads as a map of its
  nested content — each subfolder becomes its own group (#11).
- **Three default views**: new bases now ship a **List**, **Table**, and **Cards**
  view (all grouped by subfolder), so you can switch how a folder's contents are
  presented without editing the base. The list view is listed first, so it's the
  one shown when the base opens (#11).

## 1.7.0

### Added
- **Indicator color and icon**: the accent/dot/icon indicator styles now take a
  custom **Indicator color** (a color picker, or a reset button to follow the
  theme's accent color), and the icon style takes a custom **Indicator icon**
  (any Lucide icon, with search; defaults to `layout-grid`).

## 1.6.0

### Added
- **Hide base file in explorer**: a new **Hide base file in explorer** toggle
  (off by default) hides a folder's own base file (e.g. `Books/Books.base`) from
  the file explorer, for a cleaner folder-note look. Clicking the folder still
  opens it, and the folder filter is respected — only enabled folders' own bases
  are hidden (#2).

## 1.5.1

### Added
- **Graceful handling when Bases is unavailable**: if the core Bases plugin is
  disabled, opening or creating a folder base now shows a clear one-time
  `Notice` ("Enable it in Settings → Core plugins") instead of opening a `.base`
  file that won't render. Auto-create silently skips while Bases is disabled, and
  the warning clears itself once Bases is enabled again (#9).

## 1.5.0

### Added
- **Auto-create a base for new folders**: a new **Auto-create base for new
  folders** setting (off by default) generates a folder's base from the template
  the moment the folder is created — no click needed. A **Minimum notes to
  auto-create** threshold suppresses bases for folders that don't yet hold at
  least that many notes (0 = always). The folder filter is respected and the new
  base isn't opened (#7).

## 1.4.0

### Added
- **Template file reference**: a new **New base content from** setting lets new
  bases be generated from a `.base` template file in your vault (set its path in
  **Template file**) instead of the inline YAML. The `{{folder_name}}` /
  `{{folder_path}}` tokens are still substituted, and if the referenced file is
  missing the inline content is used as a fallback (#8).

## 1.3.0

### Added
- Persistent "has a base" indicator: folders that have a base are now marked in
  the file explorer at all times (scanned on load, kept in sync with vault
  create/delete/rename, and re-applied as folders collapse/expand). A **Folder
  base indicator** setting chooses the style — none, italic (default), bold,
  accent color, dot, or icon. Only a folder's own base counts, and excluded
  folders are never marked (#1).

## 1.2.0

### Added
- Commands (with user-assignable hotkeys; none bound by default): open base for
  the active folder, create base for the active folder, reveal base file in the
  file explorer, and — on desktop — open the base file in the default app or show
  it in the system file manager. The "active folder" is resolved smartly: the
  file explorer's focused folder when the explorer is focused, otherwise the
  active note's parent folder (#4).
- **Open base in** setting — choose where a base opens: current tab, new tab,
  split right, or reuse an already-open tab. Middle-clicking a folder always
  opens its base in a new tab (#6).
- Vitest unit-test harness covering the pure settings logic (`devbox run test`).

## 1.1.0

### Added
- Exclude / include folder filter so only certain folders trigger base behavior,
  with `*` glob patterns and optional subfolder matching (#5).
- Roadmap document.

## 1.0.2

### Changed
- The default base template now excludes the folder's own `.base` file, listing
  notes only (`file.ext == "md"`).

## 1.0.1

### Changed
- Added the author URL to the manifest and normalized the lockfile (maintenance).

## 1.0.0

### Added
- Initial release: click a folder in the file explorer to open its associated
  `.base` (plain click or modifier + click, configurable).
- Configurable base filename template with `{{folder_name}}` / `{{folder_path}}`
  tokens (default: a same-named `.base` inside the folder).
- Optionally create a base from a template on modifier + click when none exists.
- Folder right-click menu: open or create the folder's base.

