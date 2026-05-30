# Folder Bases — Claude guide

Obsidian plugin: clicking a folder in the file explorer opens an associated
Obsidian **Base** (`.base` file), analogous to the "Folder Notes" plugin but for
Bases.

## Layout

```
src/main.ts        Plugin entry: click interception, base resolve/open/create, context menu
src/settings.ts    Settings interface, defaults, pure helpers, settings tab
test/              Vitest unit tests + an "obsidian" module mock
manifest.json      Obsidian plugin manifest (id: folder-bases)
esbuild.config.mjs Bundles src/main.ts -> main.js
vitest.config.ts   Test config; aliases "obsidian" to test/obsidian-mock.ts
devbox.json        Toolchain (Node 22) + build/dev/test/run scripts
docs/              End-user and format documentation
ARCHITECTURE.md    How it works internally
CHANGELOG.md       Keep a Changelog; new work goes under "Unreleased"
ROADMAP.md         Planned features
```

This plugin lives **inside the test vault** at
`folder-bases-demo/.obsidian/plugins/folder-bases/`, so the build output
(`main.js`) is loaded directly by Obsidian — no copy step.

## Build / dev

Uses [devbox](https://www.jetify.com/devbox) for the toolchain. The init hook
runs `npm install` on first entry.

- `devbox run build` — type-check + production bundle to `main.js`
- `devbox run dev` — esbuild watch mode (rebuild on save)
- `devbox run test` — run the Vitest unit tests (`npm run test:watch` for watch mode)
- `devbox run release <version>` — bump version (manifest/package/versions.json),
  build, commit, push, and publish a GitHub release with the assets attached
  (delegates to the `release` recipe in `justfile`; needs a clean tree and an
  authenticated `gh`)
- `devbox run run -- <cmd>` — run an arbitrary command in the env (e.g. `devbox run run -- node -v`)

After building, reload the plugin in Obsidian (toggle off/on in
Settings → Community plugins, or reload the app) to pick up changes.

## Changelog

`CHANGELOG.md` follows [Keep a Changelog](https://keepachangelog.com/) +
[SemVer](https://semver.org/) (`MAJOR.MINOR.PATCH` — breaking / feature / fix).

- **When planning or implementing any user-facing change, add an entry under the
  `## Unreleased` section** (categories: Added / Changed / Fixed / Removed).
  Treat this as part of "done," like updating docs and tests. Reference the
  roadmap item number when applicable (e.g. `(#6)`).
- Don't hand-write version headers. `devbox run release <version>` renames
  `## Unreleased` to `## <version>` and reuses that section as the GitHub release
  notes (see the `release` recipe in `justfile`). Pick the version per SemVer:
  bump MINOR for a new feature, PATCH for a fix.

## Key facts

- **No custom view is registered.** The core Bases plugin owns the `.base`
  extension; we just `workspace.getLeaf().openFile(tFile)` and Obsidian renders it.
- **Click interception** is a capture-phase `click` listener on `document`
  (`registerDomEvent(..., { capture: true })`) so it runs before the explorer's
  own collapse/expand handler. Folder titles are `.nav-folder-title` elements
  carrying a `data-path` attribute. We only `preventDefault()` when we actually
  open/create a base.
- **Base path** = folder path + rendered `baseNameTemplate` (default
  `{{folder_name}}.base`). See `basePathForFolder` in `src/main.ts`.

## Testing

- **Unit tests** (`test/settings.test.ts`, run with `devbox run test`) cover the
  pure logic in `src/settings.ts`: `renderTemplate`, `globToRegExp`,
  `parsePatterns`, `folderMatchesPatterns`, and `isFolderEnabled`. Keep these
  functions pure and exported so they stay testable without the Obsidian runtime.
- Tests import `src/settings.ts`, which imports `"obsidian"`. Vitest aliases that
  to `test/obsidian-mock.ts` (a tiny stub providing `normalizePath` and inert UI
  class stubs). If you reference a new `obsidian` symbol from tested code, add it
  to the mock.
- **Manual / end-to-end:** see `docs/usage.md` for the flow in the demo vault.
