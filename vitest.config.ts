import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// `src/settings.ts` imports from "obsidian", which only exists inside the
// Obsidian app at runtime. For tests we alias it to a small local mock that
// provides the handful of symbols the module needs at import time.
export default defineConfig({
	resolve: {
		alias: {
			obsidian: fileURLToPath(
				new URL("./test/obsidian-mock.ts", import.meta.url),
			),
		},
	},
	test: {
		include: ["test/**/*.test.ts"],
		environment: "node",
	},
});
