import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import {
  BLOCK_COLUMNS, SETTINGS_COLUMNS, resolveBlock, resolveSettings, sortBlocks,
  type LinksBlock, type LinksPageSettings,
} from '@/lib/linksPage';

export interface LinksPageData {
  settings: LinksPageSettings;
  blocks: LinksBlock[];
}

/**
 * The company links page: its settings and its blocks. The database only hands out the blocks that
 * are switched on and inside their dates, so what arrives is what the page shows. Null: the content
 * could not be read (not configured, or the tables are not there yet): the page then draws its
 * built-in fallback instead of an error.
 */
export function useLinksPage() {
  return useQuery({
    queryKey: ['links-page'],
    queryFn: async (): Promise<LinksPageData | null> => {
      if (!isSupabaseConfigured) return null;
      const [settings, blocks] = await Promise.all([
        supabase.from('links_page_settings').select(SETTINGS_COLUMNS).eq('id', 1).maybeSingle(),
        supabase.from('links_page_blocks').select(BLOCK_COLUMNS).order('sort_order', { ascending: true }),
      ]);
      if (settings.error || blocks.error) return null;
      return {
        settings: resolveSettings(settings.data),
        blocks: sortBlocks((blocks.data ?? []).map(resolveBlock).filter((b): b is LinksBlock => b !== null)),
      };
    },
    // Short, so a change saved in the dashboard shows up within a minute for people who keep the page open.
    staleTime: 30_000,
  });
}
