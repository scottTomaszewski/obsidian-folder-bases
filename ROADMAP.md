# Roadmap

Planned features for Folder Bases, ranked by user value. Effort is a rough
T-shirt size (S / M / L). "Touches" lists the main files involved.

Status legend: 🔲 planned · 🚧 in progress · ✅ done

Shipped features and their release versions are recorded in
[`CHANGELOG.md`](CHANGELOG.md).

## Planned features

### 3. Keep the base in sync on folder rename/move 🔲
On folder rename, the base filename (`OldName.base`) and its
`file.inFolder("OldName")` filter both go stale. Auto-rename the base file and
rewrite the filter via `vault.on("rename")` + `Vault.process()`.
- **Why:** prevents silent breakage — the biggest footgun of the same-name convention.
- **Effort:** M · **Touches:** `main.ts`

### 10. Per-folder override of which base to open 🔲
Allow a folder to point at a non-default base (e.g. context menu → "Set as folder
base"), for when the base lives elsewhere or has a custom name.
- **Why:** flexibility for users who don't want the same-name convention everywhere.
- **Effort:** M–L · **Touches:** `main.ts`, `settings.ts`, persisted data

> Note: #3 (rename sync) and #10 (per-folder override) share persisted state —
> design their data model together if both are planned.

> Item numbers are retained from the original "Next 10 features" list (the
> completed items are in `CHANGELOG.md`), so existing references stay stable.

## Backlog / nice-to-have

- List nested folder bases as clickable drill-down links inside the parent base
  (a second view filtered to subfolder `.base` files) — the deferred half of #11,
  so an MOC can navigate *into* sub-MOCs, not just list nested notes.
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
