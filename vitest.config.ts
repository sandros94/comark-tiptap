import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    isolate: false,
    fsModuleCache: true,

    exclude: [...configDefaults.exclude, "**/.claude/**", "playgrounds/**"],

    coverage: {
      exclude: ["dist/**", "test/**", "playgrounds/**", "build.config.ts", "vitest.config.ts"],
      // `json-summary` feeds the CI job summary; `html` stays for local browsing.
      reporter: ["text", "html", "json-summary"],
    },
  },
});
