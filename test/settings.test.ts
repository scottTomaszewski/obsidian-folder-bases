import { describe, expect, it } from "vitest";
import {
	basePathFor,
	DEFAULT_BASE_TEMPLATE,
	DEFAULT_SETTINGS,
	FolderBasesSettings,
	folderMatchesPatterns,
	globToRegExp,
	isFolderEnabled,
	paneArgForOpenLocation,
	parsePatterns,
	renderTemplate,
	templateFilePath,
} from "../src/settings";

/** Build a settings object from the defaults with targeted overrides. */
function withSettings(
	overrides: Partial<FolderBasesSettings>,
): FolderBasesSettings {
	return { ...DEFAULT_SETTINGS, ...overrides };
}

describe("renderTemplate", () => {
	it("substitutes folder name and path tokens", () => {
		expect(renderTemplate("{{folder_name}}.base", "Books", "a/Books")).toBe(
			"Books.base",
		);
		expect(renderTemplate("{{folder_path}}/index", "Books", "a/Books")).toBe(
			"a/Books/index",
		);
	});

	it("tolerates whitespace inside the braces", () => {
		expect(renderTemplate("{{ folder_name }}.base", "Books", "Books")).toBe(
			"Books.base",
		);
	});

	it("replaces every occurrence of a token", () => {
		expect(
			renderTemplate("{{folder_name}}-{{folder_name}}", "X", "p"),
		).toBe("X-X");
	});

	it("renders the default base template scoped to the folder", () => {
		const yaml = renderTemplate(DEFAULT_BASE_TEMPLATE, "Books", "a/Books");
		expect(yaml).toContain('file.inFolder("a/Books")');
		expect(yaml).toContain('file.ext == "md"');
		// No leftover tokens.
		expect(yaml).not.toContain("{{");
	});
});

describe("templateFilePath", () => {
	it("returns null for the inline source regardless of the path", () => {
		expect(
			templateFilePath(
				withSettings({
					templateSource: "inline",
					templateFile: "Templates/Folder.base",
				}),
			),
		).toBeNull();
	});

	it("returns the normalized path for the file source", () => {
		expect(
			templateFilePath(
				withSettings({
					templateSource: "file",
					templateFile: "/Templates//Folder.base/",
				}),
			),
		).toBe("Templates/Folder.base");
	});

	it("returns null when the file source has no path set", () => {
		expect(
			templateFilePath(
				withSettings({ templateSource: "file", templateFile: "" }),
			),
		).toBeNull();
		expect(
			templateFilePath(
				withSettings({ templateSource: "file", templateFile: "   " }),
			),
		).toBeNull();
	});
});

describe("basePathFor", () => {
	const DEFAULT = DEFAULT_SETTINGS.baseNameTemplate;

	it("places a same-name base inside the folder (default template)", () => {
		expect(basePathFor("Projects", "Projects", DEFAULT)).toBe(
			"Projects/Projects.base",
		);
	});

	it("handles nested folders", () => {
		expect(basePathFor("2024", "Archive/2024", DEFAULT)).toBe(
			"Archive/2024/2024.base",
		);
	});

	it("supports the {{folder_path}} token", () => {
		expect(basePathFor("Books", "a/Books", "{{folder_path}}.base")).toBe(
			"a/Books/a/Books.base",
		);
	});

	it("does not prepend a slash for a root-level folder", () => {
		expect(basePathFor("Inbox", "Inbox", DEFAULT)).toBe("Inbox/Inbox.base");
	});

	it("normalizes the resulting path", () => {
		expect(basePathFor("Books", "a/Books", "/{{folder_name}}.base")).toBe(
			"a/Books/Books.base",
		);
	});
});

describe("globToRegExp", () => {
	it("matches a literal name exactly (anchored)", () => {
		const re = globToRegExp("Archive");
		expect(re.test("Archive")).toBe(true);
		expect(re.test("Archives")).toBe(false);
		expect(re.test("Archive/2024")).toBe(false);
		expect(re.test("MyArchive")).toBe(false);
	});

	it("treats * as a single-segment wildcard", () => {
		expect(globToRegExp("*").test("anything")).toBe(true);
		expect(globToRegExp("*").test("a/b")).toBe(false);
		expect(globToRegExp("Foo*").test("Foobar")).toBe(true);
		expect(globToRegExp("Foo*").test("Foo/bar")).toBe(false);
		expect(globToRegExp("*/drafts").test("Blog/drafts")).toBe(true);
		expect(globToRegExp("*/drafts").test("drafts")).toBe(false);
		expect(globToRegExp("*/drafts").test("a/b/drafts")).toBe(false);
	});

	it("treats ** as a cross-segment wildcard", () => {
		expect(globToRegExp("**").test("a/b/c")).toBe(true);
		expect(globToRegExp("Archive/**").test("Archive/2024/Q1")).toBe(true);
		expect(globToRegExp("Archive/**").test("Archive")).toBe(false);
	});

	it("escapes regex metacharacters in literals", () => {
		expect(globToRegExp("v1.0").test("v1.0")).toBe(true);
		expect(globToRegExp("v1.0").test("v1x0")).toBe(false);
		expect(globToRegExp("C++").test("C++")).toBe(true);
		expect(globToRegExp("C++").test("C")).toBe(false);
		expect(globToRegExp("Notes (old)").test("Notes (old)")).toBe(true);
	});

	it("preserves literal spaces in folder names", () => {
		expect(globToRegExp("Daily Notes").test("Daily Notes")).toBe(true);
		expect(globToRegExp("Daily Notes").test("DailyXNotes")).toBe(false);
	});
});

describe("parsePatterns", () => {
	it("splits lines, trims, and drops blanks", () => {
		expect(parsePatterns("Archive\n  Templates  \n\n\t\nProjects")).toEqual([
			"Archive",
			"Templates",
			"Projects",
		]);
	});

	it("normalizes slashes via normalizePath", () => {
		expect(parsePatterns("/Projects/\nArchive\\2024")).toEqual([
			"Projects",
			"Archive/2024",
		]);
	});

	it("returns an empty array for empty or whitespace input", () => {
		expect(parsePatterns("")).toEqual([]);
		expect(parsePatterns("   \n\t\n  ")).toEqual([]);
	});
});

describe("folderMatchesPatterns", () => {
	it("returns false when there are no patterns", () => {
		expect(folderMatchesPatterns("Archive", "", true)).toBe(false);
	});

	it("matches an exact folder path", () => {
		expect(folderMatchesPatterns("Archive", "Archive", false)).toBe(true);
		expect(folderMatchesPatterns("Archive/2024", "Archive", false)).toBe(
			false,
		);
	});

	it("matches descendants when matchSubfolders is on", () => {
		expect(folderMatchesPatterns("Archive/2024", "Archive", true)).toBe(true);
		expect(folderMatchesPatterns("Archive/2024/Q1", "Archive", true)).toBe(
			true,
		);
	});

	it("does not match descendants when matchSubfolders is off", () => {
		expect(folderMatchesPatterns("Archive/2024", "Archive", false)).toBe(
			false,
		);
	});

	it("supports glob patterns, including over descendants", () => {
		expect(folderMatchesPatterns("Blog/drafts", "*/drafts", true)).toBe(true);
		expect(folderMatchesPatterns("Blog/drafts/old", "*/drafts", true)).toBe(
			true,
		);
		expect(folderMatchesPatterns("Blog", "*/drafts", true)).toBe(false);
	});

	it("matches any of several patterns", () => {
		const patterns = "Archive\nTemplates";
		expect(folderMatchesPatterns("Templates", patterns, true)).toBe(true);
		expect(folderMatchesPatterns("Notes", patterns, true)).toBe(false);
	});

	it("does not match on partial name overlap", () => {
		expect(folderMatchesPatterns("Booking", "Books", true)).toBe(false);
		expect(folderMatchesPatterns("ArchiveOld", "Archive", true)).toBe(false);
	});

	it("handles folder names containing spaces", () => {
		expect(folderMatchesPatterns("Daily Notes/2024", "Daily Notes", true)).toBe(
			true,
		);
	});
});

describe("paneArgForOpenLocation", () => {
	it("opens in the current tab for 'tab'", () => {
		expect(paneArgForOpenLocation("tab")).toBe(false);
	});

	it("opens a new tab for 'new-tab'", () => {
		expect(paneArgForOpenLocation("new-tab")).toBe("tab");
	});

	it("splits for 'split'", () => {
		expect(paneArgForOpenLocation("split")).toBe("split");
	});

	it("behaves like the current tab for 'reuse' (resolved earlier)", () => {
		expect(paneArgForOpenLocation("reuse")).toBe(false);
	});
});

describe("isFolderEnabled", () => {
	it("enables every folder in 'all' mode regardless of patterns", () => {
		const s = withSettings({
			folderFilterMode: "all",
			folderPatterns: "Archive",
		});
		expect(isFolderEnabled("Archive", s)).toBe(true);
		expect(isFolderEnabled("Projects", s)).toBe(true);
	});

	it("excludes matching folders (and descendants) in 'exclude' mode", () => {
		const s = withSettings({
			folderFilterMode: "exclude",
			folderPatterns: "Archive\nTemplates",
		});
		expect(isFolderEnabled("Archive", s)).toBe(false);
		expect(isFolderEnabled("Archive/2024", s)).toBe(false);
		expect(isFolderEnabled("Templates", s)).toBe(false);
		expect(isFolderEnabled("Projects", s)).toBe(true);
	});

	it("allows only matching folders in 'include' mode", () => {
		const s = withSettings({
			folderFilterMode: "include",
			folderPatterns: "Projects",
		});
		expect(isFolderEnabled("Projects", s)).toBe(true);
		expect(isFolderEnabled("Projects/Sub", s)).toBe(true);
		expect(isFolderEnabled("Books", s)).toBe(false);
	});

	it("treats an empty pattern list as a no-op (never a lockout)", () => {
		expect(
			isFolderEnabled(
				"Anything",
				withSettings({ folderFilterMode: "exclude", folderPatterns: "" }),
			),
		).toBe(true);
		expect(
			isFolderEnabled(
				"Anything",
				withSettings({
					folderFilterMode: "include",
					folderPatterns: "   \n  ",
				}),
			),
		).toBe(true);
	});

	it("honors matchSubfolders = false", () => {
		const s = withSettings({
			folderFilterMode: "exclude",
			folderPatterns: "Archive",
			matchSubfolders: false,
		});
		expect(isFolderEnabled("Archive", s)).toBe(false);
		expect(isFolderEnabled("Archive/2024", s)).toBe(true);
	});
});
