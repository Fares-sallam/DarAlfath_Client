import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  APPEARANCE_COLUMNS, DEFAULT_APPEARANCE, PREVIEW_PARAM, decodePreview, resolveAppearance,
  type StorefrontAppearance,
} from '@/lib/appearance';

const PREVIEW_KEY = 'storefront-preview-look';

/**
 * The look the dashboard asked for, read before anything is drawn from it. When the dashboard opens the store
 * to preview a draft, the draft is in the address (once); it is kept for this tab so that moving between
 * pages keeps showing it, and it never touches the database.
 */
function previewDraft(): StorefrontAppearance | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromAddress = decodePreview(window.location.search);
    if (fromAddress) {
      window.sessionStorage.setItem(PREVIEW_KEY, JSON.stringify(fromAddress));
      return fromAddress;
    }
    // «?previewLook=off» closes the preview for this tab
    if (new URLSearchParams(window.location.search).get(PREVIEW_PARAM) === 'off') {
      window.sessionStorage.removeItem(PREVIEW_KEY);
      return null;
    }
    const kept = window.sessionStorage.getItem(PREVIEW_KEY);
    return kept ? resolveAppearance(JSON.parse(kept)) : null;
  } catch {
    return null;
  }
}

export function useAppearance(): { appearance: StorefrontAppearance; isPreview: boolean } {
  const { data } = useQuery({
    queryKey: ['storefront-appearance'],
    queryFn: async (): Promise<StorefrontAppearance> => {
      if (!isSupabaseConfigured) return DEFAULT_APPEARANCE;
      const { data: row, error } = await supabase
        .from('storefront_appearance')
        .select(APPEARANCE_COLUMNS)
        .eq('id', 1)
        .maybeSingle();
      // The table not being there yet, or any other trouble, is the house look, never a broken page.
      if (error || !row) return DEFAULT_APPEARANCE;
      return resolveAppearance(row);
    },
    staleTime: 60_000,
    placeholderData: DEFAULT_APPEARANCE,
  });
  const draft = previewDraft();
  return { appearance: draft ?? data ?? DEFAULT_APPEARANCE, isPreview: draft !== null };
}
