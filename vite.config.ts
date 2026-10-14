import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { injectSeo, staticSeo } from './src/lib/seo';

/**
 * The address the site is known by: VITE_SITE_URL if set, otherwise the production domain Vercel
 * reports (a custom domain once one is the primary one). Empty when building locally.
 */
const siteUrl = (process.env.VITE_SITE_URL?.trim().replace(/\/$/, '') ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : ''));

export default defineConfig({
  plugins: [
    react(),
    {
      // The home page is a plain file (no function in front of it), so its tags are written in at build time.
      name: 'site-seo',
      transformIndexHtml(html) {
        return siteUrl ? injectSeo(html, staticSeo('home', siteUrl), siteUrl) : html;
      },
    },
  ],
  define: { __SITE_URL__: JSON.stringify(siteUrl) },

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
});
