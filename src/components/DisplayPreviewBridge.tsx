import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { isDisplayPreview, startDisplayPreviewBridge } from '@/lib/displayPreview';

/** Decided once, when the page is opened: the dashboard's frame opens the store with ?preview=display. */
const ENABLED = isDisplayPreview();

/**
 * Only on the dashboard's preview page: takes the drafts the dashboard sends («تفاصيل العرض» and the look), the page to show and the
 * day / night theme (see lib/displayPreview.ts). Draws nothing.
 */
export default function DisplayPreviewBridge() {
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const current = useRef({ theme, toggleTheme });
  current.current = { theme, toggleTheme };
  useEffect(() => (
    ENABLED
      ? startDisplayPreviewBridge(
          (path) => navigate(path),
          (wanted) => { if (current.current.theme !== wanted) current.current.toggleTheme(); },
        )
      : undefined
  ), [navigate]);
  return null;
}
