import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import { CountryProvider } from '@/contexts/CountryContext';
import { WishlistProvider } from '@/contexts/WishlistContext';
import { CartProvider } from '@/contexts/CartContext';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import './styles.css';
import './styles-enhancements.css'; // ✦ Dark mode rules — scoped under html.dark
import './styles-craft.css';        // ✦ Craft layer — covers, motion, typography polish
import './styles-home.css';         // ✦ Home layer — frontispiece, shelf rails, ornaments
import './styles-filters.css';      // ✦ Catalog filters — the books page's search and filter panel
import './styles-search.css';       // ✦ Live search — the results list under the header box
import './styles-shop.css';         // ✦ Shop layer — card price/share, book page share, toast, video shelf
import './styles-brand.css';        // ✦ Brand layer — house fonts, swatches, lockup, pattern
import './styles-auth.css';         // ✦ Auth layer — the customer sign-in / sign-up page, drawn with the pattern
import './styles-appearance.css';   // ✦ What the dashboard decides: pattern strength, button colours
import './styles-display.css';      // ✦ Display details: book card flags, books per row, footer columns (chosen in the dashboard)
import './styles-node-page.css';    // ✦ Series / section pages: welcome text, video and strips of books
import './styles-menu-tree.css';    // ✦ Top menu from the dashboard's display map: nested menus
import { isStorePath, STORE_BASE_PATH } from '@/lib/storePaths';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 60_000, refetchOnWindowFocus: false },
  },
});

const legacyTestRoutes = import.meta.env.VITE_LEGACY_TEST_ROUTES === 'true';
const storeAtNewPath = isStorePath(window.location.pathname);
const storeMode = storeAtNewPath || (legacyTestRoutes && window.location.pathname !== '/links');

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter basename={storeAtNewPath ? STORE_BASE_PATH : undefined}>
        <ThemeProvider>
          <CountryProvider>
            <AuthProvider>
              <WishlistProvider>
                <CartProvider>
                  <App mode={storeMode ? 'store' : 'links'} />
                </CartProvider>
              </WishlistProvider>
            </AuthProvider>
          </CountryProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);
