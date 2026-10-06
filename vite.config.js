import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { homeSeo, injectHead } from './src/seo/seo.js'

// index.html gets the home page's SEO tags (title, description, canonical,
// Open Graph, JSON-LD) from the same module the server uses for posts/events.
const seoDefaults = {
  name: 'seo-defaults',
  transformIndexHtml: (html) => injectHead(html, homeSeo()),
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), seoDefaults],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.js'],
  },
})
