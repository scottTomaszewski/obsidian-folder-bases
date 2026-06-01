// Minimal stand-in for the "obsidian" module so unit tests can import
// `src/settings.ts` outside the Obsidian app. Only the symbols referenced at
// import time (or by the pure functions under test) are implemented; the UI
// classes are inert stubs because the settings tab's `display()` is never
// invoked in these tests.

/**
 * Mirror Obsidian's `normalizePath` closely enough for path-matching tests:
 * normalize slashes, collapse duplicates, and strip leading/trailing slashes.
 */
export function normalizePath(path: string): string {
	return path
		.trim()
		.replace(/\\/g, "/")
		.replace(/\/{2,}/g, "/")
		.replace(/^\/+|\/+$/g, "");
}

export class App {}

// Inert stubs: the settings tab's `display()` is never called in tests, but
// `IconSuggest extends AbstractInputSuggest` is evaluated at import time, so the
// base class and these helpers must exist as named exports.
export class AbstractInputSuggest<T> {
	constructor(_app: App, _inputEl: unknown) {
		void _app;
		void _inputEl;
	}
}

export function getIconIds(): string[] {
	return [];
}

export function setIcon(_el: unknown, _iconId: string): void {
	void _el;
	void _iconId;
}

export class PluginSettingTab {
	app: App;
	plugin: unknown;
	containerEl: unknown;

	constructor(app: App, plugin: unknown) {
		this.app = app;
		this.plugin = plugin;
	}
}

export class Setting {
	constructor(_containerEl: unknown) {}
}
