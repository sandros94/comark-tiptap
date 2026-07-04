export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  compatibilityDate: 'latest',

  css: ['~/assets/css/main.css'],

  vite: {
    optimizeDeps: {
      include: [
        '@tiptap/core',
        '@tiptap/extension-code-block',
        '@tiptap/extension-image',
        '@tiptap/extension-mention',
        '@tiptap/extension-placeholder',
        '@tiptap/extension-table',
        '@tiptap/starter-kit',
        '@tiptap/vue-3',
        '@vueuse/core',
        'comark',
        'comark/render',
        'comark-tiptap',
        'comark-tiptap/vue',
      ],
    },
  },
})
