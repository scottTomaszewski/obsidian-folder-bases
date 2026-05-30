# Folder Bases — Claude guide

Obsidian plugin: clicking a folder in the file explorer opens an associated
Obsidian **Base** (`.base` file), analogous to the "Folder Notes" plugin but for
Bases.

## Layout

```
src/main.ts        Plugin entry: click interception, base resolve/open/create, context menu
src/settings.ts    Settings interface, defaults, template rendering, settings tab
manifest.json      Obsidian plugin manifest (id: folder-bases)
esbuild.config.mjs Bundles src/main.ts -> main.js
devbox.json        Toolchain (Node 22) + build/dev/run scripts
docs/              End-user and format documentation
ARCHITECTURE.md    How it works internally
```

This plugin lives **inside the test vault** at
`folder-bases-demo/.obsidian/plugins/folder-bases/`, so the build output
(`main.js`) is loaded directly by Obsidian — no copy step.

## Build / dev

Uses [devbox](https://www.jetify.com/devbox) for the toolchain. The init hook
runs `npm install` on first entry.

- `devbox run build` — type-check + production bundle to `main.js`
- `devbox run dev` — esbuild watch mode (rebuild on save)
- `devbox run run -- <cmd>` — run an arbitrary command in the env (e.g. `devbox run run -- node -v`)

After building, reload the plugin in Obsidian (toggle off/on in
Settings → Community plugins, or reload the app) to pick up changes.

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

## Testing manually

See `docs/usage.md` for the end-to-end test flow in the demo vault.
