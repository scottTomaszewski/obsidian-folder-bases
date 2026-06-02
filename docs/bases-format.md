# The `.base` file format

A `.base` file is a YAML document interpreted by Obsidian's core **Bases** plugin.
Folder Bases writes one of these when auto-creating a base. This page documents
the subset we rely on; see the official
[Bases syntax docs](https://help.obsidian.md/bases/syntax) for the full schema.

## Top-level keys

| Key | Purpose |
|-----|---------|
| `filters` | Conditions narrowing the dataset (default: every file in the vault). |
| `views` | One or more rendered views (table, cards, …). |
| `formulas` | Reusable computed properties. |
| `properties` | Per-property config (e.g. display names). |
| `summaries` | Custom aggregation formulas. |

## Filters

A filter is either a single string statement or a nested object keyed by `and`,
`or`, or `not`, each holding a list. Statements use comparisons or built-in
functions such as `file.inFolder(...)`, `file.hasTag(...)`, `file.hasLink(...)`.

```yaml
filters:
  and:
    - file.inFolder("Projects")
    - file.hasTag("active")
```

## Views

Each view supports `type`, `name`, `limit`, `groupBy`, `filters`, `order`, and
`summaries`. Displayed columns are listed under `order` (not `columns`). Property
prefixes: `file.*` (file metadata like `file.name`, `file.ext`, `file.folder`),
`note.*` (or a bare name) for frontmatter, `formula.*` for formulas.

```yaml
views:
  - type: table
    name: Table
    order:
      - file.name
      - file.ext
```

`groupBy` splits a view into headed sections by a property; it takes an object
with `property` and `direction` (`ASC` / `DESC`). `file.folder` (the file's
immediate parent folder) groups notes by subfolder — the basis of the default
MOC template below:

```yaml
    groupBy:
      property: file.folder
      direction: ASC
```

## The default template used by this plugin

Defined in `src/settings.ts` as `DEFAULT_BASE_TEMPLATE`, with `{{folder_path}}`
substituted at creation time:

```yaml
filters:
  and:
    - file.inFolder("{{folder_path}}")
    - file.ext == "md"
views:
  - type: list
    name: List
    groupBy:
      property: file.folder
      direction: ASC
    order:
      - file.name
  - type: table
    name: Table
    groupBy:
      property: file.folder
      direction: ASC
    order:
      - file.name
      - file.mtime
  - type: cards
    name: Cards
    groupBy:
      property: file.folder
      direction: ASC
    order:
      - file.name
      - file.mtime
```

For a folder `Projects`, this produces a base scoped to the notes in `Projects`,
shown three ways — a **list**, **table**, and **cards** — that the Bases view
switcher toggles between. Bases shows the **first** view in the list when a base
is opened (there is no separate "default view" key in the core schema), so the
list view is listed first to make it the default. `file.inFolder(...)` is **recursive**, so notes in
subfolders are included too; `groupBy: file.folder` then groups every view by the
immediate subfolder, so the base reads as an MOC — a map of the folder's nested
content rather than one flat list. The `file.ext == "md"` filter limits results
to markdown notes, which keeps the folder's own `.base` file (and any images or
other attachments) out. Edit **Default base content** in the plugin settings to
change what new bases look like (e.g. add columns to `order`, drop a view, drop
the `groupBy` for a flat list, or switch a view `type`).

## Notes / caveats

- The Bases schema has evolved across Obsidian releases (1.8 → 1.9+). If a
  generated base fails to render, create one base by hand through the Bases UI
  and inspect its source to confirm the current syntax, then update the default
  template to match.
- `file.inFolder(...)` matches files within the given folder path **recursively**
  — it returns true for the folder itself and any subfolder
  ([per the Bases docs](https://help.obsidian.md/bases/functions)). The default
  template relies on this to pull nested content into the folder's MOC.
