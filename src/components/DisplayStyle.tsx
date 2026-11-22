import { useEffect } from 'react';
import { useDisplaySettings } from '@/hooks/useDisplaySettings';

/**
 * Puts the dashboard's «كتب في الصف» choice on <html> as attributes that styles-display.css reads (a number of books per
 * row on a computer and on a phone). Nothing chosen sets nothing, so the grid keeps the way it was designed. Draws nothing.
 */
export default function DisplayStyle() {
  const { card } = useDisplaySettings();
  const { desktop, mobile } = card.perRow;

  useEffect(() => {
    const root = document.documentElement;
    if (desktop) root.setAttribute('data-cols-d', String(desktop)); else root.removeAttribute('data-cols-d');
    if (mobile) root.setAttribute('data-cols-m', String(mobile)); else root.removeAttribute('data-cols-m');
    return () => {
      root.removeAttribute('data-cols-d');
      root.removeAttribute('data-cols-m');
    };
  }, [desktop, mobile]);

  return null;
}
