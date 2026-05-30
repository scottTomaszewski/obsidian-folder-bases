import { App, PluginSettingTab, Setting } from "obsidian";
import type FolderBasesPlugin from "./main";

/** How a folder-title click is mapped to "open the base". */
export type ClickTrigger = "click" | "modifier";

/** Which keyboard modifier counts as the "open / create" modifier. */
export type ModifierKey = "ctrl" | "alt";

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
}

export const DEFAULT_BASE_TEMPLATE = `filters:
  and:
    - file.inFolder("{{folder_path}}")
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
};

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
	}
}
