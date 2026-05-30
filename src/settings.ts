import { App, PluginSettingTab, Setting, normalizePath, type PaneType } from "obsidian";
import type FolderBasesPlugin from "./main";

/** How a folder-title click is mapped to "open the base". */
export type ClickTrigger = "click" | "modifier";

/** Which keyboard modifier counts as the "open / create" modifier. */
export type ModifierKey = "ctrl" | "alt";

/** Which folders the plugin acts on. */
export type FolderFilterMode = "all" | "exclude" | "include";

/** Where a base opens: current tab, a new tab, a right split, or an existing tab. */
export type OpenLocation = "tab" | "new-tab" | "split" | "reuse";

/** How folders with a base are marked in the file explorer ("none" = no marker). */
export type IndicatorStyle = "none" | "italic" | "bold" | "accent" | "dot" | "icon";

export interface FolderBasesSettings {
	/**
	 * Filename template for a folder's base, resolved relative to the folder.
	 * Supports {{folder_name}} and {{folder_path}} tokens.
	 */
	baseNameTemplate: string;
	/** Plain click opens the base, or require a modifier key. */
	clickTrigger: ClickTrigger;
	/** Modifier used for the "modifier" trigger and for create-on-click. */
	modifierKey: ModifierKey;
	/** When no base exists, a modifier+click creates one from the template. */
	createOnModifierClick: boolean;
	/** When a plain click opens a base, also let the folder expand/collapse. */
	collapseOnOpen: boolean;
	/** YAML written into newly created .base files. Supports the same tokens. */
	defaultBaseTemplate: string;
	/** Which folders the plugin acts on: all, all-but-listed, or only-listed. */
	folderFilterMode: FolderFilterMode;
	/** Newline-separated folder patterns; `*` is a glob wildcard. */
	folderPatterns: string;
	/** When matching patterns, also match a folder's descendants. */
	matchSubfolders: boolean;
	/** Where a base opens when triggered (click, command, or context menu). */
	openLocation: OpenLocation;
	/** How folders that have a base are marked in the file explorer. */
	indicatorStyle: IndicatorStyle;
}

export const DEFAULT_BASE_TEMPLATE = `filters:
  and:
    - file.inFolder("{{folder_path}}")
    - file.ext == "md"
views:
  - type: table
    name: Table
`;

export const DEFAULT_SETTINGS: FolderBasesSettings = {
	baseNameTemplate: "{{folder_name}}.base",
	clickTrigger: "click",
	modifierKey: "ctrl",
	createOnModifierClick: true,
	collapseOnOpen: false,
	defaultBaseTemplate: DEFAULT_BASE_TEMPLATE,
	folderFilterMode: "all",
	folderPatterns: "",
	matchSubfolders: true,
	openLocation: "tab",
	indicatorStyle: "italic",
};

/**
 * Map an open location to the argument for `Workspace.getLeaf(...)`. "reuse" is
 * resolved before this is called (it focuses an already-open tab, else falls
 * back to a new tab), so here it behaves like the current tab.
 */
export function paneArgForOpenLocation(loc: OpenLocation): PaneType | boolean {
	switch (loc) {
		case "new-tab":
			return "tab";
		case "split":
			return "split";
		case "tab":
		case "reuse":
		default:
			return false;
	}
}

/** Replace {{folder_name}} / {{folder_path}} tokens in a template string. */
export function renderTemplate(
	template: string,
	folderName: string,
	folderPath: string,
): string {
	return template
		.replace(/\{\{\s*folder_name\s*\}\}/g, folderName)
		.replace(/\{\{\s*folder_path\s*\}\}/g, folderPath);
}

/**
 * Vault-relative path of a folder's base: render the filename template, join it
 * onto the folder path, and normalize. Pure so it can be unit-tested and reused.
 */
export function basePathFor(
	folderName: string,
	folderPath: string,
	template: string,
): string {
	const rendered = renderTemplate(template, folderName, folderPath);
	const joined = folderPath ? `${folderPath}/${rendered}` : rendered;
	return normalizePath(joined);
}

/**
 * Compile a folder pattern into an anchored regex. `*` matches within a path
 * segment, `**` matches across segments; everything else is matched literally.
 */
export function globToRegExp(pattern: string): RegExp {
	// Escape regex metacharacters, but leave `*` for glob handling below.
	const escaped = pattern.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
	// Expand `**` and `*` in a single pass. The alternation matches `**` before
	// `*`, so no placeholder character is needed and literal spaces in folder
	// names are preserved.
	const source = escaped.replace(/\*\*|\*/g, (match) =>
		match === "**" ? ".*" : "[^/]*",
	);
	return new RegExp(`^${source}$`);
}

/** Ancestor chain of a path, deepest first: a/b/c -> [a/b/c, a/b, a]. */
function ancestorChain(folderPath: string): string[] {
	const chain: string[] = [];
	let current = folderPath;
	while (current) {
		chain.push(current);
		const slash = current.lastIndexOf("/");
		if (slash < 0) break;
		current = current.slice(0, slash);
	}
	return chain;
}

/** Parse the newline-separated pattern list into normalized, non-empty entries. */
export function parsePatterns(patternsText: string): string[] {
	return patternsText
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line.length > 0)
		.map((line) => normalizePath(line));
}

/**
 * Does `folderPath` match any of the patterns? When `matchSubfolders` is true a
 * pattern also matches descendants (by testing each ancestor of the folder).
 */
export function folderMatchesPatterns(
	folderPath: string,
	patternsText: string,
	matchSubfolders: boolean,
): boolean {
	const patterns = parsePatterns(patternsText);
	if (patterns.length === 0) return false;
	const candidates = matchSubfolders
		? ancestorChain(folderPath)
		: [folderPath];
	return patterns.some((pattern) => {
		const re = globToRegExp(pattern);
		return candidates.some((candidate) => re.test(candidate));
	});
}

/** Whether the plugin should act on the given folder, per the filter settings. */
export function isFolderEnabled(
	folderPath: string,
	settings: FolderBasesSettings,
): boolean {
	if (settings.folderFilterMode === "all") return true;
	// An empty pattern list is a safe no-op rather than a full lockout.
	if (parsePatterns(settings.folderPatterns).length === 0) return true;
	const matched = folderMatchesPatterns(
		folderPath,
		settings.folderPatterns,
		settings.matchSubfolders,
	);
	return settings.folderFilterMode === "exclude" ? !matched : matched;
}

export class FolderBasesSettingTab extends PluginSettingTab {
	plugin: FolderBasesPlugin;

	constructor(app: App, plugin: FolderBasesPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		new Setting(containerEl)
			.setName("Base filename template")
			.setDesc(
				"Path of a folder's base, relative to the folder. Tokens: {{folder_name}}, {{folder_path}}.",
			)
			.addText((text) =>
				text
					.setPlaceholder("{{folder_name}}.base")
					.setValue(this.plugin.settings.baseNameTemplate)
					.onChange(async (value) => {
						this.plugin.settings.baseNameTemplate =
							value.trim() || DEFAULT_SETTINGS.baseNameTemplate;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Click trigger")
			.setDesc(
				"How a folder opens its base. 'Plain click' opens on a normal click; 'Modifier + click' requires holding the modifier key.",
			)
			.addDropdown((dd) =>
				dd
					.addOption("click", "Plain click")
					.addOption("modifier", "Modifier + click")
					.setValue(this.plugin.settings.clickTrigger)
					.onChange(async (value) => {
						this.plugin.settings.clickTrigger = value as ClickTrigger;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Modifier key")
			.setDesc(
				"Modifier used for the 'Modifier + click' trigger and for creating a base on click.",
			)
			.addDropdown((dd) =>
				dd
					.addOption("ctrl", "Ctrl / Cmd")
					.addOption("alt", "Alt / Option")
					.setValue(this.plugin.settings.modifierKey)
					.onChange(async (value) => {
						this.plugin.settings.modifierKey = value as ModifierKey;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Create base on modifier + click")
			.setDesc(
				"When a folder has no base, a modifier + click creates one from the default template and opens it.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.createOnModifierClick)
					.onChange(async (value) => {
						this.plugin.settings.createOnModifierClick = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Toggle folder when opening")
			.setDesc(
				"When a plain click opens a base, also expand/collapse the folder as usual. If off, the folder stays put.",
			)
			.addToggle((toggle) =>
				toggle
					.setValue(this.plugin.settings.collapseOnOpen)
					.onChange(async (value) => {
						this.plugin.settings.collapseOnOpen = value;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Open base in")
			.setDesc(
				"Where a base opens when triggered. 'Reuse existing tab' focuses an already-open tab if there is one. Middle-clicking a folder always opens in a new tab.",
			)
			.addDropdown((dd) =>
				dd
					.addOption("tab", "Current tab")
					.addOption("new-tab", "New tab")
					.addOption("split", "Split right")
					.addOption("reuse", "Reuse existing tab")
					.setValue(this.plugin.settings.openLocation)
					.onChange(async (value) => {
						this.plugin.settings.openLocation = value as OpenLocation;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Folder base indicator")
			.setDesc(
				"How folders that have a base are marked in the file explorer.",
			)
			.addDropdown((dd) =>
				dd
					.addOption("none", "None")
					.addOption("italic", "Italic")
					.addOption("bold", "Bold")
					.addOption("accent", "Accent color")
					.addOption("dot", "Dot")
					.addOption("icon", "Icon")
					.setValue(this.plugin.settings.indicatorStyle)
					.onChange(async (value) => {
						this.plugin.settings.indicatorStyle =
							value as IndicatorStyle;
						await this.plugin.saveSettings();
					}),
			);

		new Setting(containerEl)
			.setName("Default base content")
			.setDesc(
				"YAML written into newly created .base files. Tokens: {{folder_name}}, {{folder_path}}.",
			)
			.addTextArea((area) => {
				area
					.setValue(this.plugin.settings.defaultBaseTemplate)
					.onChange(async (value) => {
						this.plugin.settings.defaultBaseTemplate =
							value || DEFAULT_SETTINGS.defaultBaseTemplate;
						await this.plugin.saveSettings();
					});
				area.inputEl.rows = 8;
				area.inputEl.addClass("folder-bases-template-input");
			});

		new Setting(containerEl)
			.setName("Folder filter")
			.setDesc(
				"Which folders respond to clicks. Pattern matching is case-sensitive.",
			)
			.addDropdown((dd) =>
				dd
					.addOption("all", "All folders")
					.addOption("exclude", "Exclude these folders")
					.addOption("include", "Only these folders")
					.setValue(this.plugin.settings.folderFilterMode)
					.onChange(async (value) => {
						this.plugin.settings.folderFilterMode =
							value as FolderFilterMode;
						await this.plugin.saveSettings();
						// Re-render so the dependent controls show/hide.
						this.display();
					}),
			);

		if (this.plugin.settings.folderFilterMode !== "all") {
			new Setting(containerEl)
				.setName("Folder patterns")
				.setDesc(
					"One folder path per line. Use * as a wildcard, e.g. */drafts. Example: Archive, Templates.",
				)
				.addTextArea((area) => {
					area
						.setValue(this.plugin.settings.folderPatterns)
						.onChange(async (value) => {
							this.plugin.settings.folderPatterns = value;
							await this.plugin.saveSettings();
						});
					area.inputEl.rows = 5;
					area.inputEl.addClass("folder-bases-template-input");
				});

			new Setting(containerEl)
				.setName("Match subfolders")
				.setDesc(
					"A pattern also matches folders nested inside it (e.g. Archive covers Archive/2024).",
				)
				.addToggle((toggle) =>
					toggle
						.setValue(this.plugin.settings.matchSubfolders)
						.onChange(async (value) => {
							this.plugin.settings.matchSubfolders = value;
							await this.plugin.saveSettings();
						}),
				);
		}
	}
}
