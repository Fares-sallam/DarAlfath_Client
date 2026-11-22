import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { DEFAULT_DISPLAY, DISPLAY_COLUMN, resolveDisplay, type DisplaySettings } from '@/lib/displaySettings';
import { useDisplayPreview } from '@/lib/displayPreview';

const CACHE_KEY = 'storefront-display-v1';

/** What the dashboard said last time, for the first paint of a returning visitor (so a hidden element is not drawn and then removed). */
function remembered(): DisplaySettings | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? resolveDisplay(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function remember(settings: DisplaySettings) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(settings));
  } catch {
    /* private window or no room: the next visit simply starts from the defaults */
  }
}

/**
 * What a book card, a book's page and the footer show, as chosen in the dashboard («مظهر المتجر» ← «تفاصيل العرض»).
 * The column not being there, no row, or any other trouble is how things were designed, never a broken page.
 */
export function useDisplaySettings(): DisplaySettings {
  const { data } = useQuery({
    queryKey: ['storefront-display'],
    queryFn: async (): Promise<DisplaySettings> => {
      if (!isSupabaseConfigured) return DEFAULT_DISPLAY;
      const { data: row, error } = await supabase.from('storefront_appearance').select(DISPLAY_COLUMN).eq('id', 1).maybeSingle();
      if (error || !row) return remembered() ?? DEFAULT_DISPLAY;
      const settings = resolveDisplay((row as { display?: unknown }).display);
      remember(settings);
      return settings;
    },
    staleTime: 60_000,
    placeholderData: () => remembered() ?? DEFAULT_DISPLAY,
  });
  // on the dashboard's preview page, the draft being edited stands in for the saved settings (see lib/displayPreview.ts)
  const draft = useDisplayPreview();
  return draft ?? data ?? DEFAULT_DISPLAY;
}
