import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

/* Resets scroll to the top on every route change. Without this, navigating
   from a scrolled list (catalog / home) into a book page lands you partway
   down the new page. Uses an instant jump because the global
   `scroll-behavior: smooth` would otherwise animate the reset between routes. */
export default function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' as ScrollBehavior });
  }, [pathname]);

  return null;
}
