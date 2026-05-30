import {
	Notice,
	Platform,
	Plugin,
	TAbstractFile,
	TFile,
	TFolder,
	View,
	WorkspaceLeaf,
	normalizePath,
} from "obsidian";
import {
	DEFAULT_SETTINGS,
	FolderBasesSettings,
	FolderBasesSettingTab,
	isFolderEnabled,
	OpenLocation,
	paneArgForOpenLocation,
	renderTemplate,
} from "./settings";

// Typed views of runtime-only Obsidian APIs that aren't in the public types.
declare module "obsidian" {
	interface App {
		/** Reveal a vault file in the OS file manager (desktop only). */
		showInFolder(path: string): void;
		/** Open a vault file with the OS default app (desktop only). */
		openWithDefaultApp(path: string): void;
	}
}

/** Minimal shape of the core file-explorer view that we rely on. */
interface FileExplorerView extends View {
	tree?: { focusedItem?: { file?: TAbstractFile } };
	revealInFolder?(file: TAbstractFile): void;
}

const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

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

		// Middle-click a folder title to open its base in a new tab.
		this.registerDomEvent(document, "auxclick", this.onAuxClick, {
			capture: true,
		});

		this.registerCommands();

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
		const hit = this.folderFromTitleClick(evt.target);
		if (!hit) return;
		const { titleEl, folder } = hit;

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

	private onAuxClick = (evt: MouseEvent): void => {
		// Middle button only.
		if (evt.button !== 1) return;
		const hit = this.folderFromTitleClick(evt.target);
		if (!hit) return;

		const basePath = this.basePathForFolder(hit.folder);
		const base = this.app.vault.getAbstractFileByPath(basePath);
		// Only act when a base exists; leave other middle-clicks untouched.
		if (!(base instanceof TFile)) return;

		hit.titleEl.addClass(HAS_BASE_CLASS);
		evt.preventDefault();
		evt.stopPropagation();
		void this.openBase(base, "new-tab");
	};

	/**
	 * Resolve the enabled folder for a click on a `.nav-folder-title`, or null
	 * when the target isn't an actionable folder title (chevron, non-folder, or
	 * a folder excluded by the filter).
	 */
	private folderFromTitleClick(
		target: EventTarget | null,
	): { titleEl: HTMLElement; folder: TFolder } | null {
		if (!(target instanceof HTMLElement)) return null;

		// Let the collapse chevron always toggle the folder.
		if (target.closest(".nav-folder-collapse-indicator")) return null;

		const titleEl = target.closest(".nav-folder-title");
		if (!(titleEl instanceof HTMLElement)) return null;

		const folderPath = titleEl.getAttribute("data-path");
		if (folderPath === null) return null;

		const folder = this.app.vault.getAbstractFileByPath(folderPath);
		if (!(folder instanceof TFolder)) return null;

		// Respect the folder filter; excluded folders behave like normal folders.
		if (!isFolderEnabled(folder.path, this.settings)) return null;

		return { titleEl, folder };
	}

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

	private async openBase(file: TFile, location?: OpenLocation): Promise<void> {
		const loc = location ?? this.settings.openLocation;

		if (loc === "reuse") {
			const existing = this.findLeafShowingFile(file);
			if (existing) {
				this.app.workspace.setActiveLeaf(existing, { focus: true });
				await this.app.workspace.revealLeaf(existing);
				return;
			}
			// Not open anywhere: fall back to a new tab.
			await this.app.workspace.getLeaf("tab").openFile(file);
			return;
		}

		await this.app.workspace
			.getLeaf(paneArgForOpenLocation(loc))
			.openFile(file);
	}

	/** The first open leaf already showing `file`, or null. */
	private findLeafShowingFile(file: TFile): WorkspaceLeaf | null {
		let found: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves((leaf) => {
			if (found) return;
			if (leaf.getViewState().state?.file === file.path) found = leaf;
		});
		return found;
	}

	/**
	 * Best-effort "active folder": the file explorer's focused item when the
	 * explorer is focused, otherwise the active note's parent, else the vault
	 * root.
	 */
	private resolveActiveFolder(): TFolder {
		const leaf = this.app.workspace.activeLeaf;
		if (leaf && leaf.view.getViewType() === FILE_EXPLORER_VIEW_TYPE) {
			const item = (leaf.view as FileExplorerView).tree?.focusedItem?.file;
			if (item instanceof TFolder) return item;
			if (item instanceof TFile && item.parent instanceof TFolder) {
				return item.parent;
			}
		}
		const active = this.app.workspace.getActiveFile();
		if (active?.parent instanceof TFolder) return active.parent;
		return this.app.vault.getRoot();
	}

	/** Reveal a file in the core file-explorer nav pane. */
	private revealInExplorer(file: TFile): void {
		const leaf = this.app.workspace.getLeavesOfType(
			FILE_EXPLORER_VIEW_TYPE,
		)[0];
		const view = leaf?.view as FileExplorerView | undefined;
		if (view?.revealInFolder) {
			view.revealInFolder(file);
		} else {
			new Notice("Folder Bases: file explorer is not available");
		}
	}

	/** The existing base file for the active folder, or null. */
	private activeFolderBase(): TFile | null {
		const folder = this.resolveActiveFolder();
		if (!isFolderEnabled(folder.path, this.settings)) return null;
		const base = this.app.vault.getAbstractFileByPath(
			this.basePathForFolder(folder),
		);
		return base instanceof TFile ? base : null;
	}

	private registerCommands(): void {
		this.addCommand({
			id: "open-active-folder-base",
			name: "Open base for the active folder",
			checkCallback: (checking) => {
				const base = this.activeFolderBase();
				if (!base) return false;
				if (!checking) void this.openBase(base);
				return true;
			},
		});

		this.addCommand({
			id: "create-active-folder-base",
			name: "Create base for the active folder",
			checkCallback: (checking) => {
				const folder = this.resolveActiveFolder();
				if (!isFolderEnabled(folder.path, this.settings)) return false;
				if (!checking) void this.createAndOpenBase(folder);
				return true;
			},
		});

		this.addCommand({
			id: "reveal-active-folder-base",
			name: "Reveal base file in file explorer",
			checkCallback: (checking) => {
				const base = this.activeFolderBase();
				if (!base) return false;
				if (!checking) this.revealInExplorer(base);
				return true;
			},
		});

		// OS-level actions only exist on desktop.
		if (Platform.isDesktopApp) {
			this.addCommand({
				id: "open-active-folder-base-default-app",
				name: "Open base file in default app",
				checkCallback: (checking) => {
					const base = this.activeFolderBase();
					if (!base) return false;
					if (!checking) this.app.openWithDefaultApp(base.path);
					return true;
				},
			});

			this.addCommand({
				id: "show-active-folder-base-in-system",
				name: "Show base file in system explorer",
				checkCallback: (checking) => {
					const base = this.activeFolderBase();
					if (!base) return false;
					if (!checking) this.app.showInFolder(base.path);
					return true;
				},
			});
		}
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
