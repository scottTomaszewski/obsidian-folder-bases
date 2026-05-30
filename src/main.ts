import { Notice, Plugin, TFile, TFolder, normalizePath } from "obsidian";
import {
	DEFAULT_SETTINGS,
	FolderBasesSettings,
	FolderBasesSettingTab,
	isFolderEnabled,
	renderTemplate,
} from "./settings";

/** Class added to folder titles that have an associated base. */
const HAS_BASE_CLASS = "has-folder-base";

export default class FolderBasesPlugin extends Plugin {
	settings!: FolderBasesSettings;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new FolderBasesSettingTab(this.app, this));

		// Capture phase so we run before the file explorer's own collapse/expand
		// handler and can suppress it when we decide to open a base instead.
		this.registerDomEvent(document, "click", this.onClick, { capture: true });

		// Right-click menu on folders, for discoverability.
		this.registerEvent(
			this.app.workspace.on("file-menu", (menu, file) => {
				if (!(file instanceof TFolder)) return;
				if (!isFolderEnabled(file.path, this.settings)) return;
				const basePath = this.basePathForFolder(file);
				const existing = this.app.vault.getAbstractFileByPath(basePath);
				if (existing instanceof TFile) {
					menu.addItem((item) =>
						item
							.setTitle("Open folder base")
							.setIcon("layout-grid")
							.onClick(() => void this.openBase(existing)),
					);
				} else {
					menu.addItem((item) =>
						item
							.setTitle("Create folder base")
							.setIcon("layout-grid")
							.onClick(() => void this.createAndOpenBase(file)),
					);
				}
			}),
		);
	}

	private onClick = (evt: MouseEvent): void => {
		const target = evt.target;
		if (!(target instanceof HTMLElement)) return;

		// Let the collapse chevron always toggle the folder.
		if (target.closest(".nav-folder-collapse-indicator")) return;

		const titleEl = target.closest(".nav-folder-title");
		if (!(titleEl instanceof HTMLElement)) return;

		const folderPath = titleEl.getAttribute("data-path");
		if (folderPath === null) return;

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return;

		// Respect the folder filter; excluded folders behave like normal folders.
		if (!isFolderEnabled(folder.path, this.settings)) return;

		// Does this click satisfy the configured trigger?
		const modifierHeld = this.isModifierHeld(evt);
		const triggered =
			this.settings.clickTrigger === "click" ? true : modifierHeld;
		if (!triggered) return;

		const basePath = this.basePathForFolder(folder);
		const base = this.app.vault.getAbstractFileByPath(basePath);

		if (base instanceof TFile) {
			titleEl.addClass(HAS_BASE_CLASS);
			if (!this.settings.collapseOnOpen) {
				evt.preventDefault();
				evt.stopPropagation();
			}
			void this.openBase(base);
			return;
		}

		// No base yet: only act on an explicit modifier+click when enabled.
		if (modifierHeld && this.settings.createOnModifierClick) {
			evt.preventDefault();
			evt.stopPropagation();
			void this.createAndOpenBase(folder);
		}
		// Otherwise leave the event alone so the folder toggles normally.
	};

	private isModifierHeld(evt: MouseEvent): boolean {
		if (this.settings.modifierKey === "alt") return evt.altKey;
		// Treat Cmd (mac) the same as Ctrl.
		return evt.ctrlKey || evt.metaKey;
	}

	/** Vault-relative path of the base file for a folder. */
	private basePathForFolder(folder: TFolder): string {
		const folderName = folder.name || folder.path;
		const rendered = renderTemplate(
			this.settings.baseNameTemplate,
			folderName,
			folder.path,
		);
		const joined = folder.path ? `${folder.path}/${rendered}` : rendered;
		return normalizePath(joined);
	}

	private async openBase(file: TFile): Promise<void> {
		await this.app.workspace.getLeaf(false).openFile(file);
	}

	private async createAndOpenBase(folder: TFolder): Promise<void> {
		const basePath = this.basePathForFolder(folder);
		const existing = this.app.vault.getAbstractFileByPath(basePath);
		if (existing instanceof TFile) {
			await this.openBase(existing);
			return;
		}

		const content = renderTemplate(
			this.settings.defaultBaseTemplate,
			folder.name || folder.path,
			folder.path,
		);
		try {
			const created = await this.app.vault.create(basePath, content);
			if (created instanceof TFile) {
				new Notice(`Created base: ${basePath}`);
				await this.openBase(created);
			}
		} catch (err) {
			new Notice(`Folder Bases: could not create ${basePath}`);
			console.error("Folder Bases: failed to create base", basePath, err);
		}
	}

	async loadSettings(): Promise<void> {
		this.settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			await this.loadData(),
		);
	}

	async saveSettings(): Promise<void> {
		await this.saveData(this.settings);
	}
}
