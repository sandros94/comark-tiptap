import { defineBuildConfig } from 'obuild/config'

const CORE_EXTERNAL = [/^@tiptap\//, /^comark(\/|$)/, /^vue$/]

export default defineBuildConfig({
  entries: [
    {
      type: 'bundle',
      input: ['./src/index.ts'],
      rolldown: {
        platform: 'neutral',
        external: CORE_EXTERNAL,
      },
    },
    {
      type: 'bundle',
      input: ['./src/vue/index.ts'],
      rolldown: {
        platform: 'neutral',
        external: [...CORE_EXTERNAL, 'comark-tiptap'],
      },
    },
  ],
})
