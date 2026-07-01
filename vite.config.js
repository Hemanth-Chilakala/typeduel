import { defineConfig } from 'vite'

// `base` is set at deploy time to '/<repo-name>/' for GitHub Pages project sites.
// Leave as './' so it works both locally and on Pages regardless of repo name.
export default defineConfig({
  base: './',
  server: {
    host: true,
  },
})
