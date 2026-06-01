import {
	Debouncer,
	Notice,
	Platform,
	Plugin,
	TAbstractFile,
	TFile,
	TFolder,
	View,
	WorkspaceLeaf,
	debounce,
	getIcon,
} from "obsidian";
import {
	basePathFor,
	DEFAULT_SETTINGS,
	FolderBasesSettings,
	FolderBasesSettingTab,
	isFolderEnabled,
	OpenLocation,
	paneArgForOpenLocation,
	renderTemplate,
	templateFilePath,
} from "./settings";

// Typed views of runtime-only Obsidian APIs that aren't in the public types.
declare module "obsidian" {
	interface App {
		/** Reveal a vault file in the OS file manager (desktop only). */
		showInFolder(path: string): void;
		/** Open a vault file with the OS default app (desktop only). */
		openWithDefaultApp(path: string): void;
		/** Registry of core ("internal") plugins, keyed by id. */
		internalPlugins: {
			getEnabledPluginById?(id: string): unknown | null;
			plugins?: Record<string, { enabled?: boolean } | undefined>;
		};
	}
}

/** Id of the core plugin that owns and renders the `.base` extension. */
const BASES_PLUGIN_ID = "bases";

/** Minimal shape of the core file-explorer view that we rely on. */
interface FileExplorerView extends View {
	tree?: { focusedItem?: { file?: TAbstractFile } };
	revealInFolder?(file: TAbstractFile): void;
}

const FILE_EXPLORER_VIEW_TYPE = "file-explorer";

/** Class added to folder titles that have an associated base. */
const HAS_BASE_CLASS = "has-folder-base";

/** Class added to a file title to hide it (a folder's own base file). */
const HIDDEN_BASE_CLASS = "folder-bases-hidden";

/** Per-explorer class selecting the indicator style (suffixed with the style). */
const INDICATOR_CLASS_PREFIX = "folder-bases-indicator-";

/** Every indicator-style class, so we can strip the stale one before re-applying. */
const INDICATOR_CLASSES = ["italic", "bold", "accent", "dot", "icon"].map(
	(style) => INDICATOR_CLASS_PREFIX + style,
);

/** CSS custom properties carrying the user's dynamic color / icon choices. */
const INDICATOR_COLOR_VAR = "--folder-bases-indicator-color";
const INDICATOR_ICON_VAR = "--folder-bases-indicator-icon";

export default class FolderBasesPlugin extends Plugin {
	settings!: FolderBasesSettings;

	/** Folder paths that should be marked (enabled folder whose base exists). */
	private markedFolders = new Set<string>();
	/** Base file paths owned by an enabled folder (its own base), for hiding. */
	private baseFiles = new Set<string>();
	/** Watches the explorer DOM so indicators survive collapse/expand/scroll. */
	private explorerObserver: MutationObserver | null = null;
	/** Rebuild the set, then re-mark (vault changed). */
	private refreshIndicators!: Debouncer<[], void>;
	/** Re-mark from the existing set (DOM re-rendered; vault unchanged). */
	private reapplyIndicators!: Debouncer<[], void>;

	/** Newly created folder paths awaiting an auto-create check. */
	private pendingAutoCreate = new Set<string>();
	/** Process queued new folders once their contents have settled. */
	private autoCreateBases!: Debouncer<[], void>;

	/** True once we've warned that the core Bases plugin is unavailable. */
	private warnedBasesUnavailable = false;

	async onload(): Promise<void> {
		await this.loadSettings();
		this.addSettingTab(new FolderBasesSettingTab(this.app, this));

		this.refreshIndicators = debounce(() => {
			this.rebuildMarkedFolders();
			this.applyIndicators();
		}, 150);
		this.reapplyIndicators = debounce(() => this.applyIndicators(), 50);
		// Debounced so a folder created together with its notes (import, sync,
		// drag-drop) is counted after the files land, not while it's still empty.
		this.autoCreateBases = debounce(
			() => void this.processPendingAutoCreate(),
			400,
		);

		// Mark folders once the explorer DOM and vault are ready, then keep them
		// in sync with vault and layout changes.
		this.app.workspace.onLayoutReady(() => {
			this.installIndicators();
			this.installAutoCreate();
		});
		this.register(() => this.teardownIndicators());

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
		const { folder } = hit;

		// Does this click satisfy the configured trigger?
		const modifierHeld = this.isModifierHeld(evt);
		const triggered =
			this.settings.clickTrigger === "click" ? true : modifierHeld;
		if (!triggered) return;

		const basePath = this.basePathForFolder(folder);
		const base = this.app.vault.getAbstractFileByPath(basePath);

		if (base instanceof TFile) {
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
		return basePathFor(
			folder.name || folder.path,
			folder.path,
			this.settings.baseNameTemplate,
		);
	}

	// --- Persistent "has a base" indicator -------------------------------

	/** Wire up the indicator: initial scan + the listeners that keep it fresh. */
	private installIndicators(): void {
		this.rebuildMarkedFolders();
		this.applyIndicators();
		this.observeExplorers();

		// Vault changes can add/remove/move a base file or folder.
		this.registerEvent(this.app.vault.on("create", this.refreshIndicators));
		this.registerEvent(this.app.vault.on("delete", this.refreshIndicators));
		this.registerEvent(this.app.vault.on("rename", this.refreshIndicators));

		// The explorer pane may be reopened, moved, or popped out.
		this.registerEvent(
			this.app.workspace.on("layout-change", () => {
				this.observeExplorers();
				this.reapplyIndicators();
			}),
		);
	}

	/** Strip our classes and stop observing (runs on unload). */
	private teardownIndicators(): void {
		this.explorerObserver?.disconnect();
		this.explorerObserver = null;
		for (const container of this.explorerContainers()) {
			container.removeClasses(INDICATOR_CLASSES);
			container.style.removeProperty(INDICATOR_COLOR_VAR);
			container.style.removeProperty(INDICATOR_ICON_VAR);
			for (const titleEl of this.folderTitlesIn(container)) {
				titleEl.removeClass(HAS_BASE_CLASS);
			}
			for (const titleEl of this.fileTitlesIn(container)) {
				titleEl.removeClass(HIDDEN_BASE_CLASS);
			}
		}
	}

	/** Every open file-explorer view container. */
	private explorerContainers(): HTMLElement[] {
		return this.app.workspace
			.getLeavesOfType(FILE_EXPLORER_VIEW_TYPE)
			.map((leaf) => leaf.view.containerEl);
	}

	/** The folder-title elements (with a `data-path`) inside a container. */
	private folderTitlesIn(container: HTMLElement): HTMLElement[] {
		return Array.from(
			container.querySelectorAll<HTMLElement>(
				".nav-folder-title[data-path]",
			),
		);
	}

	/** The file-title elements (with a `data-path`) inside a container. */
	private fileTitlesIn(container: HTMLElement): HTMLElement[] {
		return Array.from(
			container.querySelectorAll<HTMLElement>(".nav-file-title[data-path]"),
		);
	}

	/**
	 * Recompute the base-tracking sets from the vault: `markedFolders` (enabled
	 * folders whose base exists) and `baseFiles` (those bases' own file paths,
	 * used to hide them in the explorer).
	 */
	private rebuildMarkedFolders(): void {
		this.markedFolders.clear();
		this.baseFiles.clear();
		for (const file of this.app.vault.getAllLoadedFiles()) {
			if (!(file instanceof TFolder)) continue;
			if (!isFolderEnabled(file.path, this.settings)) continue;
			const basePath = this.basePathForFolder(file);
			const base = this.app.vault.getAbstractFileByPath(basePath);
			if (base instanceof TFile) {
				this.markedFolders.add(file.path);
				this.baseFiles.add(basePath);
			}
		}
	}

	/** Reflect the current sets + chosen style onto the explorer DOM. */
	private applyIndicators(): void {
		const style = this.settings.indicatorStyle;
		const hide = this.settings.hideBaseFile;
		const colorable =
			style === "accent" || style === "dot" || style === "icon";
		const color = colorable ? this.settings.indicatorColor : "";
		const iconMask =
			style === "icon"
				? this.iconMaskValue(this.settings.indicatorIcon)
				: null;

		for (const container of this.explorerContainers()) {
			container.removeClasses(INDICATOR_CLASSES);
			if (style !== "none") {
				container.addClass(INDICATOR_CLASS_PREFIX + style);
			}
			// Pass dynamic user choices to styles.css via CSS custom properties
			// (the accepted way to feed runtime values into stylesheet rules).
			this.setCssVar(container, INDICATOR_COLOR_VAR, color);
			this.setCssVar(container, INDICATOR_ICON_VAR, iconMask);
			for (const titleEl of this.folderTitlesIn(container)) {
				const path = titleEl.getAttribute("data-path");
				const marked =
					style !== "none" &&
					path !== null &&
					this.markedFolders.has(path);
				titleEl.toggleClass(HAS_BASE_CLASS, marked);
			}
			for (const titleEl of this.fileTitlesIn(container)) {
				const path = titleEl.getAttribute("data-path");
				const hidden =
					hide && path !== null && this.baseFiles.has(path);
				titleEl.toggleClass(HIDDEN_BASE_CLASS, hidden);
			}
		}
	}

	/**
	 * Observe explorer containers for child changes (collapse/expand/scroll) so
	 * re-rendered folder titles get re-marked. Observes `childList`/`subtree`
	 * only — not attributes — so our own class toggles can't feed back in.
	 */
	private observeExplorers(): void {
		if (!this.explorerObserver) {
			this.explorerObserver = new MutationObserver(() =>
				this.reapplyIndicators(),
			);
		}
		this.explorerObserver.disconnect();
		for (const container of this.explorerContainers()) {
			this.explorerObserver.observe(container, {
				childList: true,
				subtree: true,
			});
		}
	}

	// --- Core Bases plugin availability ---------------------------------

	/**
	 * Whether the core Bases plugin (which owns the `.base` extension and renders
	 * it) is enabled. Opening or creating a base without it just yields a file
	 * that won't render, so callers guard on this. Reads runtime-only internals,
	 * tolerating older shapes where `getEnabledPluginById` is absent.
	 */
	private basesAvailable(): boolean {
		const internal = this.app.internalPlugins;
		if (typeof internal?.getEnabledPluginById === "function") {
			return internal.getEnabledPluginById(BASES_PLUGIN_ID) != null;
		}
		return internal?.plugins?.[BASES_PLUGIN_ID]?.enabled === true;
	}

	/**
	 * Guard for the open/create paths: returns true when Bases is available,
	 * otherwise shows a one-time actionable Notice and returns false. Once the
	 * user enables Bases the check passes and nothing is shown.
	 */
	private ensureBasesAvailable(): boolean {
		if (this.basesAvailable()) {
			this.warnedBasesUnavailable = false;
			return true;
		}
		if (!this.warnedBasesUnavailable) {
			this.warnedBasesUnavailable = true;
			new Notice(
				"Folder Bases: the core Bases plugin is disabled, so bases won't open. Enable it in Settings → Core plugins.",
				10000,
			);
		}
		return false;
	}

	/** Set a CSS custom property, or remove it when the value is empty/null. */
	private setCssVar(
		el: HTMLElement,
		name: string,
		value: string | null,
	): void {
		if (value) el.style.setProperty(name, value);
		else el.style.removeProperty(name);
	}

	/**
	 * A `mask` value (a `url("data:image/svg+xml,...")`) for the chosen Lucide
	 * icon, so styles.css can paint it in the indicator color. Null if the icon
	 * (and the default fallback) can't be resolved.
	 */
	private iconMaskValue(iconId: string): string | null {
		const svg = getIcon(iconId) ?? getIcon(DEFAULT_SETTINGS.indicatorIcon);
		if (!svg) return null;
		// The mask uses the shape's alpha, so paint it opaque regardless of theme.
		svg.setAttribute("stroke", "black");
		const markup = new XMLSerializer().serializeToString(svg);
		return `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;
	}

	private async openBase(file: TFile, location?: OpenLocation): Promise<void> {
		if (!this.ensureBasesAvailable()) return;
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

	/**
	 * The template string for a new base: the referenced template file's content
	 * when one is configured and exists, otherwise the inline default content.
	 * Tokens are substituted by the caller.
	 */
	private async resolveTemplate(): Promise<string> {
		const path = templateFilePath(this.settings);
		if (path) {
			const file = this.app.vault.getAbstractFileByPath(path);
			if (file instanceof TFile) return this.app.vault.cachedRead(file);
			new Notice(
				`Folder Bases: template file not found (${path}); using inline content`,
			);
		}
		return this.settings.defaultBaseTemplate;
	}

	/**
	 * Write a folder's base from the resolved template (no opening). Returns the
	 * created file, or null when creation fails (surfaced via `Notice`). Callers
	 * must check for an existing base first.
	 */
	private async createBaseFile(folder: TFolder): Promise<TFile | null> {
		const basePath = this.basePathForFolder(folder);
		const content = renderTemplate(
			await this.resolveTemplate(),
			folder.name || folder.path,
			folder.path,
		);
		try {
			const created = await this.app.vault.create(basePath, content);
			return created instanceof TFile ? created : null;
		} catch (err) {
			new Notice(`Folder Bases: could not create ${basePath}`);
			console.error("Folder Bases: failed to create base", basePath, err);
			return null;
		}
	}

	private async createAndOpenBase(folder: TFolder): Promise<void> {
		if (!this.ensureBasesAvailable()) return;
		const basePath = this.basePathForFolder(folder);
		const existing = this.app.vault.getAbstractFileByPath(basePath);
		if (existing instanceof TFile) {
			await this.openBase(existing);
			return;
		}

		const created = await this.createBaseFile(folder);
		if (created) {
			new Notice(`Created base: ${basePath}`);
			await this.openBase(created);
		}
	}

	// --- Auto-create a base for newly created folders --------------------

	/**
	 * Listen for folder creation. Registered from `onLayoutReady` (not `onload`)
	 * so the create events Obsidian fires for existing folders during startup
	 * don't trigger a flood of auto-creations.
	 */
	private installAutoCreate(): void {
		this.registerEvent(
			this.app.vault.on("create", (file) => {
				if (file instanceof TFolder) this.queueAutoCreate(file);
			}),
		);
	}

	private queueAutoCreate(folder: TFolder): void {
		if (!this.settings.autoCreateOnNewFolder) return;
		this.pendingAutoCreate.add(folder.path);
		this.autoCreateBases();
	}

	/** Drain the queue, re-resolving each path (folders may have since moved). */
	private async processPendingAutoCreate(): Promise<void> {
		const paths = [...this.pendingAutoCreate];
		this.pendingAutoCreate.clear();
		for (const path of paths) {
			const folder = this.app.vault.getAbstractFileByPath(path);
			if (folder instanceof TFolder) await this.maybeAutoCreateBase(folder);
		}
	}

	/** Create a base for a new folder when the setting + guards allow it. */
	private async maybeAutoCreateBase(folder: TFolder): Promise<void> {
		if (!this.settings.autoCreateOnNewFolder) return;
		// Don't litter the vault with bases that can't render. Silent here since
		// auto-create is unprompted background work; the open/create paths warn.
		if (!this.basesAvailable()) return;
		if (!isFolderEnabled(folder.path, this.settings)) return;
		const basePath = this.basePathForFolder(folder);
		if (this.app.vault.getAbstractFileByPath(basePath)) return;
		if (this.noteCount(folder) < this.settings.autoCreateMinNotes) return;

		const created = await this.createBaseFile(folder);
		if (created) new Notice(`Created folder base: ${basePath}`);
	}

	/** Number of markdown notes directly inside a folder (immediate children). */
	private noteCount(folder: TFolder): number {
		return folder.children.filter(
			(child) => child instanceof TFile && child.extension === "md",
		).length;
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
		// Template/filter changes move base paths or membership; style changes
		// swap the explorer class. A rebuild + re-mark covers all of them.
		this.refreshIndicators();
	}
}
