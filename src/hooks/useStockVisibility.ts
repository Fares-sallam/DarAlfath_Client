import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { DEFAULT_STOCK_VISIBILITY, STOCK_VISIBILITY_COLUMN, resolveStockVisibility, type StockVisibility } from '@/lib/stockVisibility';

const CACHE_KEY = 'storefront-stock-visibility-v1';

/** What the dashboard said last time, for the first paint of a returning visitor (so a number is not drawn and then removed). */
function remembered(): StockVisibility | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    return raw ? resolveStockVisibility(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function remember(value: StockVisibility) {
  try {
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    /* private window or no room: the next visit starts from «shown» */
  }
}

/**
 * Whether the website shows the number of copies (set in the dashboard's «إدارة المخزون»). The column not being there, no row, or
 * any other trouble keeps the number shown, as it has always been: stock is never hidden by not being able to ask.
 */
export function useStockVisibility(): StockVisibility {
  const { data } = useQuery({
    queryKey: ['storefront-stock-visibility'],
    queryFn: async (): Promise<StockVisibility> => {
      if (!isSupabaseConfigured) return DEFAULT_STOCK_VISIBILITY;
      const { data: row, error } = await supabase.from('storefront_appearance').select(STOCK_VISIBILITY_COLUMN).eq('id', 1).maybeSingle();
      if (error || !row) return remembered() ?? DEFAULT_STOCK_VISIBILITY;
      const value = resolveStockVisibility((row as Record<string, unknown>)[STOCK_VISIBILITY_COLUMN]);
      remember(value);
      return value;
    },
    staleTime: 60_000,
    placeholderData: () => remembered() ?? DEFAULT_STOCK_VISIBILITY,
  });
  return data ?? DEFAULT_STOCK_VISIBILITY;
}
