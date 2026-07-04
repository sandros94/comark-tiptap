import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/* `src/{vue,react}/**` import the core by package name (`comark-tiptap`);
   alias the subpaths to source so tests run without a build. */
export default defineConfig({
  resolve: {
    alias: {
      "comark-tiptap/vue": fileURLToPath(new URL("./src/vue/index.ts", import.meta.url)),
      "comark-tiptap/react": fileURLToPath(new URL("./src/react/index.ts", import.meta.url)),
      "comark-tiptap": fileURLToPath(new URL("./src/index.ts", import.meta.url)),
    },
  },
  test: {
    coverage: {
      exclude: ["dist/**", "test/**", "playground/**", "build.config.ts", "vitest.config.ts"],
    },
  },
});
