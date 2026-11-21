import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { usePreview } from '@/lib/homePreview';
import type { CountryItem } from '@/types/store';

interface CountryContextValue {
  countries: CountryItem[];
  selectedCountry: CountryItem | null;
  loading: boolean;
  currencySymbol: string;
  currencyCode: string;
  setSelectedCountryById: (id: string) => void;
}

const CountryContext = createContext<CountryContextValue | undefined>(undefined);
const STORAGE_KEY = 'daralfath_client_selected_country';

const fallbackCountries: CountryItem[] = [
  { id: 'eg', name: 'مصر', code: 'EG', currency: 'EGP', currency_symbol: 'ج.م', is_active: true },
  { id: 'sa', name: 'السعودية', code: 'SA', currency: 'SAR', currency_symbol: 'ر.س', is_active: true },
];

export function CountryProvider({ children }: { children: React.ReactNode }) {
  const [countries, setCountries] = useState<CountryItem[]>(fallbackCountries);
  const [selectedCountry, setSelectedCountry] = useState<CountryItem | null>(fallbackCountries[0]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadCountries = async () => {
      setLoading(true);

      if (!isSupabaseConfigured) {
        const savedId = localStorage.getItem(STORAGE_KEY);
        const found = fallbackCountries.find((item) => item.id === savedId);
        setCountries(fallbackCountries);
        setSelectedCountry(found ?? fallbackCountries[0] ?? null);
        setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from('countries')
          .select('id, name, code, currency, currency_symbol, is_active')
          .eq('is_active', true)
          .order('name');

        const rows = !error && data && data.length ? (data as CountryItem[]) : fallbackCountries;
        setCountries(rows);

        const savedId = localStorage.getItem(STORAGE_KEY);
        const found = rows.find((item) => item.id === savedId);
        setSelectedCountry(found ?? rows[0] ?? null);
        setLoading(false);
      } catch {
        setCountries(fallbackCountries);
        setSelectedCountry(fallbackCountries[0] ?? null);
        setLoading(false);
      }
    };

    void loadCountries();
  }, []);

  const setSelectedCountryById = (id: string) => {
    const found = countries.find((item) => item.id === id);
    const next = found ?? selectedCountry ?? countries[0] ?? null;

    setSelectedCountry(next);
    if (next) localStorage.setItem(STORAGE_KEY, next.id);
    else localStorage.removeItem(STORAGE_KEY);
  };

  // the dashboard's preview can look at the page as a visitor of another country (nothing is saved)
  const previewCountry = usePreview().country;
  const shownCountry = (previewCountry ? countries.find((c) => c.code?.toUpperCase() === previewCountry) : null) ?? selectedCountry;

  const value = useMemo<CountryContextValue>(
    () => ({
      countries,
      selectedCountry: shownCountry,
      loading,
      currencySymbol: shownCountry?.currency_symbol ?? 'ج.م',
      currencyCode: shownCountry?.currency ?? 'EGP',
      setSelectedCountryById,
    }),
    [countries, shownCountry, loading]
  );

  return <CountryContext.Provider value={value}>{children}</CountryContext.Provider>;
}

export function useCountry() {
  const context = useContext(CountryContext);
  if (!context) throw new Error('useCountry must be used inside CountryProvider');
  return context;
}
