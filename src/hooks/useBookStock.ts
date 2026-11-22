import { useQuery } from '@tanstack/react-query';
import { useCountry } from '@/contexts/CountryContext';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { stockByBook } from '@/lib/bookStock';

/**
 * The paper stock of every book, read once for the whole page (the list's rows carry no stock), and only when the «آخر نسخ»
 * flag is switched on for the website: with it off nothing extra is asked of the database.
 */
export function useBookStock(enabled: boolean) {
  const { selectedCountry } = useCountry();
  const countryCode = selectedCountry?.code || undefined;

  return useQuery({
    queryKey: ['book-stock-public', countryCode ?? 'all'],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<Map<string, number | null>> => {
      if (!isSupabaseConfigured) return new Map();
      try {
        let query = supabase.from('product_variants_public').select('product_id, is_digital, is_available, available_stock');
        if (countryCode) query = query.eq('country_code', countryCode);
        const { data, error } = await query;
        if (error || !data) return new Map();
        return stockByBook(data as { product_id: string; is_digital: boolean; is_available: boolean; available_stock: number | null }[]);
      } catch {
        return new Map();
      }
    },
  });
}
