import { defineBuildConfig } from "obuild/config";

/*
 * Peers kept external in every entry. `comark-tiptap` (self-reference) is
 * external in the framework entries so the core is never re-bundled there.
 */
const PEER_EXTERNAL = [/^@tiptap\//, /^comark(\/|$)/, /^vue$/, /^react(\/|$)/, /^react-dom(\/|$)/];

export default defineBuildConfig({
  entries: [
    /* Core: index.ts's graph never touches the framework dirs, so the core
       dist carries zero framework dependency. */
    {
      type: "bundle",
      input: ["./src/index.ts"],
      rolldown: {
        platform: "neutral",
        external: PEER_EXTERNAL,
      },
    },
    {
      type: "bundle",
      input: ["./src/vue/index.ts"],
      rolldown: {
        platform: "neutral",
        external: [...PEER_EXTERNAL, "comark-tiptap"],
      },
    },
    {
      type: "bundle",
      input: ["./src/react/index.ts"],
      rolldown: {
        platform: "neutral",
        external: [...PEER_EXTERNAL, "comark-tiptap"],
      },
    },
  ],
});
