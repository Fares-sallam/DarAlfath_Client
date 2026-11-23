import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';
import { injectSeo, staticSeo } from './src/lib/seo';

/**
 * The address the site is known by: VITE_SITE_URL if set, otherwise the custom
 * production domain on Vercel. Empty when building locally.
 */
const siteUrl = (process.env.VITE_SITE_URL?.trim().replace(/\/$/, '') ||
  (process.env.VERCEL ? 'https://darolfath.com' : ''));

/** Where the production build keeps the app's HTML (api/_shared.ts reads it from there). */
const APP_SHELL_FILE = 'app.html';
let outDir = 'dist';

export default defineConfig({
  plugins: [
    react(),
    {
      // On Vercel a file called index.html is what `/` is answered with, before any rewrite runs: the domain root (the links page,
      // which has a function of its own for its title, description and share picture) would never reach it, and crawlers that
      // do not run the app (WhatsApp, Facebook) would be sent the shell's own tags instead. So the production build renames it;
      // the catch-all rewrite in vercel.json and api/_shared.ts know the new name. A build anywhere else keeps index.html.
      name: 'app-shell-name',
      apply: 'build',
      enforce: 'post',
      configResolved(config) {
        outDir = path.resolve(config.root, config.build.outDir);
      },
      closeBundle() {
        if (!process.env.VERCEL) return;
        const from = path.join(outDir, 'index.html');
        if (fs.existsSync(from)) fs.renameSync(from, path.join(outDir, APP_SHELL_FILE));
      },
    },
    {
      // The shell carries the home page's tags, written in at build time: the home page (/store) has a function now, which
      // replaces them, so these only show on the few pages that have none (the cart, the account...).
      name: 'site-seo',
      transformIndexHtml(html, ctx) {
        // captcha.html (the app's security check) is not a page of the store.
        if (!ctx.path.endsWith('/index.html') && ctx.path !== '/') return html;
        return siteUrl ? injectSeo(html, staticSeo('home', siteUrl), siteUrl) : html;
      },
    },
  ],
  define: { __SITE_URL__: JSON.stringify(siteUrl) },

  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: { port: 5173 },
  build: {
    rollupOptions: {
      // captcha.html: the page the mobile app opens for its Turnstile check (served as is, before the
      // SPA rewrite, since Vercel answers files first).
      input: {
        main: path.resolve(__dirname, 'index.html'),
        captcha: path.resolve(__dirname, 'captcha.html'),
      },
    },
  },
});
